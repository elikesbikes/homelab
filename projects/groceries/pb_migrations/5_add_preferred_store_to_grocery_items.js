/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("grocery_items")
  collection.fields.add(new Field({ name: "preferred_store", type: "text", required: false }))
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("grocery_items")
  collection.fields.removeByName("preferred_store")
  app.save(collection)
})
