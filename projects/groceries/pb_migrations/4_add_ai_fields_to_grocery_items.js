/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("grocery_items")
  collection.fields.add(new Field({ name: "ai_price",   type: "number", required: false }))
  collection.fields.add(new Field({ name: "ai_store",   type: "text",   required: false }))
  collection.fields.add(new Field({ name: "ai_product", type: "text",   required: false }))
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("grocery_items")
  collection.fields.removeByName("ai_price")
  collection.fields.removeByName("ai_store")
  collection.fields.removeByName("ai_product")
  app.save(collection)
})
