migrate((app) => {
    const collection = new Collection({
        name: "purchase_history",
        type: "base",
        listRule: "",
        viewRule: "",
        createRule: "",
        updateRule: "",
        deleteRule: "",
        fields: [
            { name: "name",         type: "text",   required: true  },
            { name: "quantity",     type: "number", required: false },
            { name: "unit",         type: "text",   required: false },
            { name: "category",     type: "text",   required: false },
            { name: "unit_price",   type: "number", required: false },
            { name: "notes",        type: "text",   required: false },
            { name: "purchase_date",type: "text",   required: false },
            { name: "store",        type: "text",   required: false },
        ],
    })
    app.save(collection)
}, (app) => {
    const collection = app.findCollectionByNameOrId("purchase_history")
    app.delete(collection)
})
