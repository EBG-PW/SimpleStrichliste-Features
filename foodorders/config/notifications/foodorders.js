const buildOrderContext = (task) => JSON.parse(task.custom_message);

module.exports = [
    {
        type: 'FoodOrderCreated',
        category: 'newsletter',
        preferenceKey: 'foodorders-new-order',
        translationKeyBase: 'FoodOrders.Notifications.NewOrder',
        requiresMessage: true,
        channels: {
            email: {
                templatePath: 'config/templates/email/FoodOrderCreated.ejs',
                buildContext: buildOrderContext,
            },
        },
    },
    {
        type: 'FoodOrderArrived',
        category: 'system',
        requiresMessage: true,
        channels: {
            email: {
                templatePath: 'config/templates/email/FoodOrderArrived.ejs',
                buildContext: buildOrderContext,
                buildText: (context) => [
                    context.t('emails.greeting', { name: context.name }),
                    '',
                    context.t('emails.FoodOrderArrived.body', {
                        orderTitle: context.orderTitle,
                        vendorName: context.vendorName,
                    }),
                    '',
                    context.t('emails.FoodOrderArrived.itemsHeading'),
                    ...context.items.map((item) =>
                        `${item.quantity}x ${item.name}: ${context.t(`emails.FoodOrderArrived.statuses.${item.status}`)}`
                    ),
                    '',
                    `${context.domain}/foodorders`,
                ].join('\n'),
            },
        },
    },
];
