migrate((app) => {
    const collection = new Collection({
        name: "grocery_items",
        type: "base",
        listRule: "",
        viewRule: "",
        createRule: "",
        updateRule: "",
        deleteRule: "",
        fields: [
            { name: "name",      type: "text",   required: true  },
            { name: "quantity",  type: "number", required: false },
            { name: "unit",      type: "text",   required: false },
            { name: "category",  type: "text",   required: false },
            { name: "notes",     type: "text",   required: false },
            { name: "added_by",  type: "text",   required: true  },
            { name: "is_bought", type: "bool",   required: false },
        ],
    })
    app.save(collection)
}, (app) => {
    const collection = app.findCollectionByNameOrId("grocery_items")
    app.delete(collection)
})
