(function () {
  const featureName = "lanparty";
  const state = {
    config: null,
    root: null,
    submitRegistration: null,
    stage: 0,
    estimate: null,
    showRegCode: false,
    setupMode: false,
    oauthMode: false,
    account: {
      name: "",
      email: "",
      username: "",
      password: "",
      passwordRepeat: "",
      reg_code: "",
    },
    event: {
      arrival_date: "",
      departure_date: "",
      rules_agree: false,
      agb_agree: false,
      extra_data: {},
    },
  };

  const getStages = () => state.oauthMode ? ["dates", "agreements", "questions"] : ["account", "dates", "agreements", "questions"];

  const translate = (key, options) => {
    if (typeof i18next !== "undefined") return i18next.t(key, options);
    return key;
  };

  const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

  const formatMoney = (value) => Number(value || 0).toFixed(2);
  const inputClass = "mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500";

  const getRootInput = (name) => state.root.querySelector(`[name="${name}"]`);

  const getPriceItems = () => {
    const prices = state.config?.prices || {};
    return [
      ...(prices.FixKostenProTag || []).map((item) => ({ ...item, group: translate("Lanparty.Register.FixedCosts") })),
      ...(prices.PauschalkostenProTag || []).map((item) => ({ ...item, group: translate("Lanparty.Register.FlatCosts") })),
    ];
  };

  const getEventDateAttributes = () => {
    const startDate = state.config?.EventStartDate;
    const endDate = state.config?.EventEndDate;
    return `${startDate ? ` min="${escapeHtml(startDate)}"` : ""}${endDate ? ` max="${escapeHtml(endDate)}"` : ""}`;
  };

  const saveAccount = () => {
    ["name", "email", "username", "password", "passwordRepeat", "reg_code"].forEach((name) => {
      const input = getRootInput(name);
      if (input) state.account[name] = input.value;
    });
  };

  const saveEvent = () => {
    ["arrival_date", "departure_date"].forEach((name) => {
      const input = getRootInput(name);
      if (input) state.event[name] = input.value;
    });
    const rulesInput = getRootInput("rules_agree");
    const agbInput = getRootInput("agb_agree");
    if (rulesInput) state.event.rules_agree = rulesInput.checked;
    if (agbInput) state.event.agb_agree = agbInput.checked;
    state.event.extra_data = buildExtraData();
  };

  const saveCurrentStage = () => {
    saveAccount();
    saveEvent();
  };

  const buildExtraData = () => {
    const extraData = {};
    (state.config.fields || []).forEach((field) => {
      const input = state.root.querySelector(`[name="extra_${field.key}"]`);
      if (!input) {
        extraData[field.key] = state.event.extra_data?.[field.key] ?? field.default ?? null;
        return;
      }
      if (field.type === "bool") {
        extraData[field.key] = input.checked;
      } else if (field.type === "number") {
        extraData[field.key] = Number(input.value || 0);
      } else {
        extraData[field.key] = input.value;
      }
    });
    return extraData;
  };

  const renderList = (items) => {
    if (!items || items.length === 0) return "";
    return `<div class="mt-2 max-h-56 overflow-y-auto rounded-md border border-gray-200 bg-gray-50 p-3">
      <ul class="list-disc space-y-1 pl-5 text-sm text-gray-700">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </div>`;
  };

  const renderField = (field) => {
    const label = escapeHtml(field.label || translate(`Lanparty.Register.${field.key}`) || field.key);
    const value = state.event.extra_data?.[field.key] ?? field.default ?? "";
    if (field.type === "bool") {
      return `<label class="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" name="extra_${escapeHtml(field.key)}" ${value ? "checked" : ""} class="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
        <span>${label}</span>
      </label>`;
    }
    if (field.type === "number") {
      return `<label class="block text-sm font-medium text-gray-700">${label}
        <input type="number" name="extra_${escapeHtml(field.key)}" value="${escapeHtml(value)}" min="${escapeHtml(field.min ?? "")}" max="${escapeHtml(field.max ?? "")}" ${field.required ? "required" : ""} class="${inputClass}" />
      </label>`;
    }
    return `<label class="block text-sm font-medium text-gray-700">${label}
      <input type="text" name="extra_${escapeHtml(field.key)}" value="${escapeHtml(value)}" ${field.required ? "required" : ""} class="${inputClass}" />
    </label>`;
  };

  const fetchEstimate = async () => {
    const arrival = state.event.arrival_date;
    const departure = state.event.departure_date;
    if (!arrival || !departure) {
      state.estimate = null;
      renderCostBreakdown();
      return false;
    }

    try {
      const response = await fetch("/api/v1/lanparty/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ arrival_date: arrival, departure_date: departure }),
      });
      if (!response.ok) throw new Error("estimate failed");
      state.estimate = await response.json();
      renderCostBreakdown();
      return true;
    } catch (error) {
      state.estimate = null;
      renderCostBreakdown(translate("Lanparty.Register.InvalidDates"));
      return false;
    }
  };

  const renderCostBreakdown = (errorText = "") => {
    const container = state.root.querySelector("[data-lanparty-cost]");
    if (!container) return;
    if (errorText) {
      container.innerHTML = `<div class="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">${escapeHtml(errorText)}</div>`;
      return;
    }
    if (!state.estimate) {
      container.innerHTML = "";
      return;
    }

    const items = getPriceItems();
    container.innerHTML = `
      <div class="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-800">
        <div class="mb-2 font-semibold">${escapeHtml(translate("Lanparty.Register.CostDetails"))}</div>
        <div class="space-y-1">
          ${items.map((item) => `<div class="flex justify-between gap-3">
            <span>${escapeHtml(item.name)} <span class="text-gray-500">(${escapeHtml(item.group)})</span></span>
            <span class="shrink-0 font-mono">${formatMoney(item.amount)} EUR / ${escapeHtml(translate("Lanparty.Register.Day"))}</span>
          </div>`).join("")}
        </div>
        <div class="mt-3 border-t border-gray-200 pt-2">
          <div class="flex justify-between gap-3">
            <span>${escapeHtml(translate("Lanparty.Register.PerDay"))}</span>
            <span class="font-mono">${formatMoney(state.estimate.perDayAmount)} EUR</span>
          </div>
          <div class="flex justify-between gap-3">
            <span>${escapeHtml(translate("Lanparty.Register.Duration"))}</span>
            <span class="font-mono">${escapeHtml(translate("Lanparty.Register.Days", { count: state.estimate.days }))}</span>
          </div>
          <div class="mt-2 flex justify-between gap-3 text-base font-bold">
            <span>${escapeHtml(translate("Lanparty.Register.Total"))}</span>
            <span class="font-mono">${formatMoney(state.estimate.totalAmount)} EUR</span>
          </div>
        </div>
      </div>`;
  };

  const renderAccountStage = () => `
    <div class="space-y-4">
      <label class="block text-sm font-medium text-gray-700">${escapeHtml(translate("Setup.Form.Name"))}
        <input type="text" name="name" value="${escapeHtml(state.account.name)}" required class="${inputClass}" />
      </label>
      <label class="block text-sm font-medium text-gray-700">${escapeHtml(translate("Setup.Form.Email"))}
        <input type="email" name="email" value="${escapeHtml(state.account.email)}" required class="${inputClass}" />
      </label>
      <label class="block text-sm font-medium text-gray-700">${escapeHtml(translate("Setup.Form.Username"))}
        <input type="text" name="username" value="${escapeHtml(state.account.username)}" required class="${inputClass}" />
      </label>
      <label class="block text-sm font-medium text-gray-700">${escapeHtml(translate("Setup.Form.Password"))}
        <input type="password" name="password" value="${escapeHtml(state.account.password)}" required class="${inputClass}" />
      </label>
      <label class="block text-sm font-medium text-gray-700">${escapeHtml(translate("Setup.Form.PasswordRepeat"))}
        <input type="password" name="passwordRepeat" value="${escapeHtml(state.account.passwordRepeat)}" required class="${inputClass}" />
      </label>
      <label class="${state.showRegCode || state.account.reg_code ? "block" : "hidden"} text-sm font-medium text-gray-700">${escapeHtml(translate("Setup.Form.RegCode"))}
        <input type="text" name="reg_code" value="${escapeHtml(state.account.reg_code)}" class="${inputClass}" />
      </label>
    </div>`;

  const renderDatesStage = () => `
    <div class="space-y-4">
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label class="block text-sm font-medium text-gray-700">${escapeHtml(translate("Lanparty.Register.Arrival"))}
          <input type="date" name="arrival_date" value="${escapeHtml(state.event.arrival_date)}"${getEventDateAttributes()} required class="${inputClass}" />
        </label>
        <label class="block text-sm font-medium text-gray-700">${escapeHtml(translate("Lanparty.Register.Departure"))}
          <input type="date" name="departure_date" value="${escapeHtml(state.event.departure_date)}"${getEventDateAttributes()} required class="${inputClass}" />
        </label>
      </div>
      <div data-lanparty-cost></div>
    </div>`;

  const renderAgreementsStage = () => `
    <div class="space-y-4">
      <section>
        <h3 class="font-semibold text-gray-900">${escapeHtml(translate("Lanparty.Register.Rules"))}</h3>
        ${renderList(state.config.rules)}
        <label class="mt-3 flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" name="rules_agree" ${state.event.rules_agree ? "checked" : ""} required class="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
          <span>${escapeHtml(translate("Lanparty.Register.RulesAgree"))}</span>
        </label>
      </section>
      <section>
        <h3 class="font-semibold text-gray-900">${escapeHtml(translate("Lanparty.Register.Agb"))}</h3>
        ${renderList(state.config.agb)}
        <label class="mt-3 flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" name="agb_agree" ${state.event.agb_agree ? "checked" : ""} required class="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
          <span>${escapeHtml(translate("Lanparty.Register.AgbAgree"))}</span>
        </label>
      </section>
    </div>`;

  const renderQuestionsStage = () => `<div class="space-y-3">${(state.config.fields || []).map(renderField).join("")}</div>`;

  const renderStageBody = () => {
    const stageName = getStages()[state.stage];
    if (stageName === "account") return renderAccountStage();
    if (stageName === "dates") return renderDatesStage();
    if (stageName === "agreements") return renderAgreementsStage();
    return renderQuestionsStage();
  };

  const render = () => {
    const stageName = getStages()[state.stage];
    const titleKey = stageName === "account"
      ? (state.setupMode ? "Setup.Welcome" : "Setup.WelcomeUser")
      : "Lanparty.Register.Title";
    state.root.innerHTML = `
      <div class="bg-white rounded-xl shadow-lg p-6 sm:p-8">
        <div class="mb-6 text-center">
          <h1 class="text-2xl font-bold text-gray-800">${escapeHtml(translate(titleKey))}</h1>
        </div>
        ${renderStageBody()}
        <div class="mt-6 flex justify-between gap-3">
          <button type="button" data-lanparty-back class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 ${state.stage === 0 ? "invisible" : ""}">${escapeHtml(translate("Lanparty.Register.Back"))}</button>
          <button type="button" data-lanparty-next class="rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">${escapeHtml(state.stage === getStages().length - 1 ? translate("Setup.Form.Submit") : translate("Lanparty.Register.Next"))}</button>
        </div>
      </div>`;

    state.root.querySelector("[data-lanparty-back]").addEventListener("click", () => {
      saveCurrentStage();
      state.stage = Math.max(0, state.stage - 1);
      render();
    });
    state.root.querySelector("[data-lanparty-next]").addEventListener("click", nextStage);
    state.root.querySelectorAll('[name="arrival_date"], [name="departure_date"]').forEach((input) => {
      input.addEventListener("change", () => {
        saveCurrentStage();
        fetchEstimate();
      });
    });
    if (stageName === "dates") fetchEstimate();
  };

  const validateAccount = () => {
    saveAccount();
    const invalidInput = [...state.root.querySelectorAll("input")].find((input) => !input.checkValidity());
    if (invalidInput) {
      invalidInput.reportValidity();
      return false;
    }
    if (state.account.password !== state.account.passwordRepeat) {
      if (typeof showMessage === "function") showMessage(translate("Setup.Error.PasswordMismatch"), "error");
      return false;
    }
    return true;
  };

  const validateCurrentStage = async () => {
    saveCurrentStage();
    const stageName = getStages()[state.stage];
    if (stageName === "account") return validateAccount();
    if (stageName === "dates") return fetchEstimate();
    if (stageName === "agreements") {
      const valid = state.event.rules_agree && state.event.agb_agree;
      if (!valid && typeof showMessage === "function") showMessage(translate("Lanparty.Register.MissingAgreement"), "error");
      return valid;
    }
    const invalidInput = [...state.root.querySelectorAll("input")].find((input) => !input.checkValidity());
    if (invalidInput) {
      invalidInput.reportValidity();
      return false;
    }
    return true;
  };

  const buildRegistrationPayload = () => ({
    ...(state.oauthMode ? {} : {
      name: state.account.name,
      email: state.account.email,
      username: state.account.username,
      password: state.account.password,
      reg_code: state.account.reg_code,
    }),
    features: {
      lanparty: {
        arrival_date: state.event.arrival_date,
        departure_date: state.event.departure_date,
        rules_agree: state.event.rules_agree,
        agb_agree: state.event.agb_agree,
        extra_data: state.event.extra_data,
      },
    },
  });

  const submit = async () => {
    try {
      await state.submitRegistration(buildRegistrationPayload());
    } catch (error) {
      if (error.status === 403 || error.message === translate("Setup.Error.InvalidRegCode")) {
        state.showRegCode = true;
        state.stage = 0;
        render();
      }
      if (typeof showMessage === "function") showMessage(error.message, "error");
    }
  };

  const nextStage = async () => {
    if (!await validateCurrentStage()) return;
    if (state.stage < getStages().length - 1) {
      state.stage += 1;
      render();
      return;
    }
    await submit();
  };

  const mountStandalone = async ({ container, regCode, submitRegistration, setupMode = false, oauthMode = false }) => {
    const response = await fetch("/api/v1/lanparty/config");
    state.config = await response.json();
    state.root = container;
    state.submitRegistration = submitRegistration;
    state.account.reg_code = regCode || "";
    state.setupMode = setupMode;
    state.oauthMode = oauthMode;
    state.stage = 0;
    container.parentElement.className = "w-full max-w-lg";
    render();
  };

  const mount = async ({ container }) => {
    container.innerHTML = "";
  };

  const collect = async () => ({
    arrival_date: state.event.arrival_date,
    departure_date: state.event.departure_date,
    rules_agree: state.event.rules_agree,
    agb_agree: state.event.agb_agree,
    extra_data: state.event.extra_data,
  });

  window.SimpleStrichlisteRegistrationFeatures = window.SimpleStrichlisteRegistrationFeatures || {};
  window.SimpleStrichlisteRegistrationFeatures[featureName] = { mount, collect, mountStandalone };
})();
