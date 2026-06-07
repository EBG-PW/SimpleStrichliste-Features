const importParsers = [
    {
        id: 'lieferando_saved_html',
        translationKey: 'FoodOrders.Admin.ImportParsers.SavedHtml',
    },
];

const decodeHtmlEntities = (value) => String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#38;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&#60;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#62;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#160;/g, ' ');

const stripHtml = (value) => decodeHtmlEntities(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');

const cleanText = (value) => decodeHtmlEntities(value)
    .replace(/\s+/g, ' ')
    .trim();

const normalizePrice = (value) => {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return value > 1000 ? value / 100 : value;

    const match = String(value).replace(/\s/g, '').match(/(\d+(?:[.,]\d{1,2})?)/);
    if (!match) return null;
    return Number(match[1].replace(',', '.'));
};

const firstText = (...values) => {
    for (const value of values) {
        const text = cleanText(value);
        if (text) return text;
    }
    return '';
};

const arrayFrom = (value) => {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
};

const priceFromObject = (item) => {
    const direct = normalizePrice(item.price ?? item.unitPrice ?? item.displayPrice ?? item.priceText ?? item.priceLabel);
    if (direct !== null) return direct;

    const offer = arrayFrom(item.offers)[0];
    const offerPrice = offer ? normalizePrice(offer.price ?? offer.lowPrice ?? offer.highPrice) : null;
    if (offerPrice !== null) return offerPrice;

    const variation = arrayFrom(item.variations ?? item.variants ?? item.options)[0];
    return variation ? normalizePrice(variation.price ?? variation.basePrice ?? variation.priceText) : null;
};

const mapMenuItem = (item) => {
    if (!item || typeof item !== 'object') return null;
    const name = firstText(item.name, item.title, item.displayName);
    const price = priceFromObject(item);
    if (!name || price === null || Number.isNaN(price)) return null;

    return {
        name: name.slice(0, 120),
        description: firstText(item.description, item.shortDescription, item.details).slice(0, 500),
        price,
    };
};

const addCategory = (categories, name, items) => {
    const categoryName = firstText(name) || 'Import';
    const categoryItems = items.map(mapMenuItem).filter(Boolean);
    if (categoryItems.length === 0) return;

    const existing = categories.find(category => category.name === categoryName);
    if (existing) {
        existing.items.push(...categoryItems);
    } else {
        categories.push({ name: categoryName.slice(0, 120), items: categoryItems });
    }
};

const collectFromStructuredMenu = (node, categories) => {
    if (!node || typeof node !== 'object') return;

    const type = arrayFrom(node['@type']).map(String);
    if (type.includes('MenuSection')) {
        addCategory(categories, node.name, arrayFrom(node.hasMenuItem));
    }

    arrayFrom(node.hasMenuSection).forEach(section => collectFromStructuredMenu(section, categories));
    Object.values(node).forEach(value => {
        if (value && typeof value === 'object') collectFromStructuredMenu(value, categories);
    });
};

const collectFromGenericJson = (node, categories, depth = 0) => {
    if (!node || typeof node !== 'object' || depth > 12) return;

    const itemKeys = ['items', 'products', 'dishes', 'menuItems', 'entries'];
    for (const key of itemKeys) {
        if (Array.isArray(node[key])) {
            const items = node[key].map(mapMenuItem).filter(Boolean);
            if (items.length > 0) addCategory(categories, node.name ?? node.title ?? node.categoryName, node[key]);
        }
    }

    if (Array.isArray(node)) {
        node.forEach(value => collectFromGenericJson(value, categories, depth + 1));
    } else {
        Object.values(node).forEach(value => collectFromGenericJson(value, categories, depth + 1));
    }
};

const extractJsonBlocks = (html) => {
    const blocks = [];
    const nextData = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
    if (nextData) blocks.push(nextData[1]);

    const jsonLdPattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = jsonLdPattern.exec(html)) !== null) {
        blocks.push(match[1]);
    }

    const statePattern = /<script[^>]*>([\s\S]*?(?:menu|restaurant|dishes|products)[\s\S]*?)<\/script>/gi;
    while ((match = statePattern.exec(html)) !== null) {
        const script = match[1];
        const assignment = script.match(/(?:__INITIAL_STATE__|__APOLLO_STATE__|__PRELOADED_STATE__)\s*=\s*({[\s\S]*?});/);
        if (assignment) blocks.push(assignment[1]);
    }

    return blocks;
};

const parseMenuHtml = (html) => {
    const categories = [];
    for (const block of extractJsonBlocks(html)) {
        try {
            const json = JSON.parse(decodeHtmlEntities(block));
            collectFromStructuredMenu(json, categories);
            collectFromGenericJson(json, categories);
        } catch {
            // Ignore unrelated script blocks.
        }
    }

    return categories.map((category) => {
        const seen = new Set();
        const items = category.items.filter((item) => {
            const key = `${item.name.toLowerCase()}|${item.price}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
        return { ...category, items };
    }).filter(category => category.items.length > 0);
};

const extractRenderedText = (html, pattern) => {
    const match = html.match(pattern);
    return match ? cleanText(stripHtml(match[1])) : '';
};

const extractRenderedItemPrice = (html) => {
    const priceStart = html.search(/data-qa=["']item-price["']/i);
    if (priceStart === -1) return null;

    const afterPrice = html.slice(priceStart);
    const nextContent = afterPrice.search(/list-item-content-style_item-description|formatted-item-information|data-qa=["']item-action["']/i);
    const priceHtml = afterPrice.slice(0, nextContent === -1 ? afterPrice.length : nextContent);
    return normalizePrice(stripHtml(priceHtml));
};

const parseRenderedItemHtml = (html) => {
    const name = extractRenderedText(html, /data-qa=["']item-name["'][^>]*>([\s\S]*?)<\/span>/i);
    const price = extractRenderedItemPrice(html);
    if (!name || price === null || Number.isNaN(price)) return null;

    return {
        name: name.slice(0, 120),
        description: extractRenderedText(html, /class=["'][^"']*formatted-description-style_description[^"']*["'][^>]*>([\s\S]*?)<\/span>/i).slice(0, 500),
        price,
    };
};

const parseRenderedMenuHtml = (html) => {
    const categories = [];
    const sectionPattern = /<section\b[^>]*data-qa=["']item-category["'][^>]*>[\s\S]*?<\/section>/gi;
    let sectionMatch;

    while ((sectionMatch = sectionPattern.exec(html)) !== null) {
        const sectionHtml = sectionMatch[0];
        const categoryName = extractRenderedText(sectionHtml, /data-qa=["']heading["'][^>]*>([\s\S]*?)<\/h[1-6]>/i);
        const items = [];
        const itemPattern = /<li\b[^>]*data-item-id=["'][^"']+["'][^>]*>([\s\S]*?)<\/li>/gi;
        let itemMatch;

        while ((itemMatch = itemPattern.exec(sectionHtml)) !== null) {
            const item = parseRenderedItemHtml(itemMatch[1]);
            if (item) items.push(item);
        }

        addCategory(categories, categoryName, items);
    }

    return categories;
};

const importMenuFromHtml = (parser, html) => {
    if (!importParsers.some(entry => entry.id === parser)) {
        return { error: 'FoodOrders.Errors.ImportUnsupportedParser', status: 400 };
    }

    if (!html || typeof html !== 'string') {
        return { error: 'FoodOrders.Errors.ImportNoHtml', status: 400 };
    }

    const categories = parseMenuHtml(html);
    if (categories.length === 0) {
        categories.push(...parseRenderedMenuHtml(html));
    }

    if (categories.length === 0) {
        return { error: 'FoodOrders.Errors.ImportNoItems', status: 422 };
    }

    return { categories };
};

module.exports = {
    importParsers,
    importMenuFromHtml,
};
