module.exports = [
    {
        type: 'LanpartyPayment',
        constant: 'LANPARTY_PAYMENT',
        category: 'system',
        requiresMessage: true,
        channels: {
            email: {
                templatePath: 'config/templates/email/lanparty_payment.ejs',
                translations: {
                    de: {
                        emails: {
                            LanpartyPayment: {
                                subject: 'Zahlungsinformationen fuer {{eventName}}',
                                heading: 'Zahlungsinformationen',
                                body: 'Deine Anmeldung fuer {{eventName}} wurde gespeichert. Bitte ueberweise {{amount}} EUR mit dem Verwendungszweck {{purpose}}.',
                                event: 'Event',
                                amount: 'Betrag',
                                owner: 'Kontoinhaber',
                                iban: 'IBAN',
                                bank: 'Bank',
                                purpose: 'Verwendungszweck',
                                yes: 'Ja',
                                no: 'Nein',
                                text: 'Hallo {{name}},\n\nDeine Anmeldung fuer {{eventName}} wurde gespeichert. Bitte ueberweise {{amount}} EUR mit dem Verwendungszweck {{purpose}}.',
                            },
                        },
                    },
                },
                buildContext: (task) => JSON.parse(task.custom_message || '{}'),
                buildText: (context) => {
                    const language = context.language || 'de';
                    const getFieldLabel = (field) => {
                        const translatedLabel = field.labelKey ? context.t(field.labelKey) : '';
                        return field.labels?.[language]
                            || field.labels?.[String(language).split('-')[0]]
                            || (translatedLabel && translatedLabel !== field.labelKey ? translatedLabel : '')
                            || field.label
                            || field.key;
                    };
                    const fieldLines = Array.isArray(context.fields)
                        ? context.fields.map((field) => {
                            const value = context.extraData?.[field.key];
                            const displayValue = field.type === 'bool'
                                ? context.t(value ? 'emails.LanpartyPayment.yes' : 'emails.LanpartyPayment.no')
                                : value;
                            return getFieldLabel(field) + ': ' + (displayValue ?? '');
                        })
                        : [];
                    return [
                        context.t('emails.greeting', { name: context.name }),
                        '',
                        context.t('emails.LanpartyPayment.body', {
                            eventName: context.eventName,
                            amount: Number(context.amount || 0).toFixed(2),
                            purpose: context.bank?.purpose || context.paymentToken,
                        }),
                        '',
                        context.t('emails.LanpartyPayment.event') + ': ' + context.eventName,
                        context.t('emails.LanpartyPayment.amount') + ': ' + Number(context.amount || 0).toFixed(2) + ' EUR',
                        context.bank?.iban ? context.t('emails.LanpartyPayment.iban') + ': ' + context.bank.iban : '',
                        context.bank?.owner ? context.t('emails.LanpartyPayment.owner') + ': ' + context.bank.owner : '',
                        context.bank?.purpose ? context.t('emails.LanpartyPayment.purpose') + ': ' + context.bank.purpose : '',
                        ...fieldLines,
                        '',
                        context.domain,
                    ].filter(Boolean).join('\n');
                },
            },
        },
    },
];
