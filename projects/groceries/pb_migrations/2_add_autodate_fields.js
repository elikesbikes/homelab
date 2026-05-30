migrate((app) => {
    const collection = app.findCollectionByNameOrId("grocery_items")

    collection.fields.add(new Field({
        name: "created",
        type: "autodate",
        onCreate: true,
        onUpdate: false,
        required: false,
    }))

    collection.fields.add(new Field({
        name: "updated",
        type: "autodate",
        onCreate: true,
        onUpdate: true,
        required: false,
    }))

    app.save(collection)
}, (app) => {
    const collection = app.findCollectionByNameOrId("grocery_items")
    collection.fields.removeByName("created")
    collection.fields.removeByName("updated")
    app.save(collection)
})
