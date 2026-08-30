/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("purchase_history")
  collection.fields.add(new Field({ name: "verified", type: "bool", required: false }))
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("purchase_history")
  collection.fields.removeByName("verified")
  app.save(collection)
})
