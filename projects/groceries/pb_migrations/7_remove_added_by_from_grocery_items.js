/// <reference path="../pb_data/types.d.ts" />

// Removes the added_by field from grocery_items.
// It was used to track who added an item (TARS/Wife/Son) but is never
// displayed or filtered on in the app — purely write-only storage.
//
// ROLLBACK: stop containers, restore pb_data from the timestamped backup,
// then restart. Or run: docker exec groceries-grocery-pb-1 /usr/local/bin/entrypoint pocketbase migrate down 1

migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_4292347551")
  collection.fields.removeById("text1771793327")
  return app.save(collection)
}, (app) => {
  // DOWN — re-adds the field if migration is reversed
  const collection = app.findCollectionByNameOrId("pbc_4292347551")
  collection.fields.addAt(5, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text1771793327",
    "max": 0,
    "min": 0,
    "name": "added_by",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))
  return app.save(collection)
})
