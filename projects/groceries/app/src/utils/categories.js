const CATEGORY_KEYWORDS = {
  produce: ['apple', 'banana', 'orange', 'grape', 'berry', 'strawberry', 'blueberry', 'lemon', 'lime', 'avocado', 'tomato', 'lettuce', 'spinach', 'kale', 'broccoli', 'cauliflower', 'carrot', 'celery', 'cucumber', 'zucchini', 'pepper', 'onion', 'garlic', 'potato', 'sweet potato', 'mushroom', 'corn', 'asparagus', 'beet', 'cabbage', 'herb', 'cilantro', 'parsley', 'basil', 'mint', 'ginger', 'jalapeño', 'mango', 'pineapple', 'watermelon', 'melon'],
  dairy: ['milk', 'cheese', 'yogurt', 'greek', 'kefir', 'butter', 'cream', 'egg', 'sour cream', 'cottage cheese', 'cream cheese', 'half and half', 'whipping cream', 'oat milk', 'almond milk', 'soy milk'],
  meat: ['chicken', 'beef', 'pork', 'lamb', 'turkey', 'salmon', 'tuna', 'shrimp', 'tilapia', 'cod', 'steak', 'ground beef', 'ground turkey', 'sausage', 'bacon', 'ham', 'deli', 'hot dog', 'brisket', 'ribs', 'fish', 'seafood'],
  frozen: ['frozen', 'ice cream', 'gelato', 'sorbet', 'popsicle', 'pizza', 'burrito', 'waffle', 'edamame'],
  pantry: ['pasta', 'rice', 'bread', 'cereal', 'oat', 'flour', 'sugar', 'salt', 'pepper', 'oil', 'olive oil', 'vinegar', 'sauce', 'salsa', 'ketchup', 'mustard', 'mayonnaise', 'soy sauce', 'hot sauce', 'soup', 'broth', 'stock', 'bean', 'lentil', 'chickpea', 'can', 'canned', 'jar', 'honey', 'syrup', 'peanut butter', 'almond butter', 'jam', 'jelly', 'chip', 'cracker', 'cookie', 'snack', 'coffee', 'tea', 'juice', 'water', 'soda', 'sparkling', 'wine', 'beer', 'tortilla', 'wrap'],
}

export function detectCategory(name) {
  const lower = name.toLowerCase()
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) return category
  }
  return 'other'
}
