-- PostgreSQL Compatible Seeding Script
-- Proper foreign key order, all schema fields included

-- Purge existing data in FK-safe order (reverse dependency order)
DELETE FROM ecom_vit_sales;
DELETE FROM ecom_vit_cart_item;
DELETE FROM ecom_vit_payment;
DELETE FROM ecom_vit_order_detail;
DELETE FROM ecom_vit_cart;
DELETE FROM ecom_vit_order;
DELETE FROM ecom_vit_purchase;
DELETE FROM ecom_vit_product_image;
DELETE FROM ecom_vit_product;
DELETE FROM ecom_vit_customer;
DELETE FROM ecom_vit_category;
DELETE FROM ecom_vit_brand;
DELETE FROM ecom_vit_user;

INSERT INTO ecom_vit_user (username, is_approved, created_at)
VALUES
  ('admin', true, NOW() - (RANDOM() * INTERVAL '30 days')),
  ('staff1', true, NOW() - (RANDOM() * INTERVAL '30 days')),
  ('staff2', false, NOW() - (RANDOM() * INTERVAL '30 days'));

INSERT INTO ecom_vit_brand (name, logo_url, created_at)
VALUES
  ('NOW Foods', 'https://picsum.photos/600/400?random=26', NOW() - (RANDOM() * INTERVAL '30 days')),
  ('Solgar', 'https://picsum.photos/600/400?random=27', NOW() - (RANDOM() * INTERVAL '30 days')),
  ('Nature''s Way', 'https://picsum.photos/600/400?random=28', NOW() - (RANDOM() * INTERVAL '30 days')),
  ('Garden of Life', 'https://picsum.photos/600/400?random=29', NOW() - (RANDOM() * INTERVAL '30 days')),
  ('Doctor''s Best', 'https://picsum.photos/600/400?random=30', NOW() - (RANDOM() * INTERVAL '30 days')),
  ('Thorne Research', 'https://picsum.photos/600/400?random=31', NOW() - (RANDOM() * INTERVAL '30 days')),
  ('Jarrow Formulas', 'https://picsum.photos/600/400?random=32', NOW() - (RANDOM() * INTERVAL '30 days'));

INSERT INTO ecom_vit_category (name, created_at)
VALUES
  ('Vitamins', NOW() - (RANDOM() * INTERVAL '30 days')),
  ('Minerals', NOW() - (RANDOM() * INTERVAL '30 days')),
  ('Herbal Supplements', NOW() - (RANDOM() * INTERVAL '30 days')),
  ('Probiotics', NOW() - (RANDOM() * INTERVAL '30 days')),
  ('Omega-3 & Fish Oils', NOW() - (RANDOM() * INTERVAL '30 days')),
  ('Multivitamins', NOW() - (RANDOM() * INTERVAL '30 days')),
  ('Digestive Health', NOW() - (RANDOM() * INTERVAL '30 days'));

-- Seed Products (depends on Brands, Categories)
INSERT INTO ecom_vit_product (
  name, slug, description, status, discount, amount, potency, stock, price, 
  daily_intake, category_id, brand_id, tags, is_featured, ingredients, 
  seo_title, seo_description, weight_grams, created_at
)
VALUES
  ('Vitamin C 1000mg with Rose Hips', 'vitamin-c-1000mg-rose-hips', 'High-potency Vitamin C supplement enhanced with rose hips and bioflavonoids. Supports immune system function, collagen production, and acts as a powerful antioxidant. Ideal for daily immune support, especially during cold seasons. Each tablet provides 1000mg of Vitamin C with natural rose hip extract for enhanced absorption.', 'active', 0, '100 tablets', '1000 mg', 250, 35000, 1, (SELECT id FROM ecom_vit_category WHERE name = 'Vitamins'), (SELECT id FROM ecom_vit_brand WHERE name = 'NOW Foods'), 
   '["immune", "antioxidant", "cold", "collagen"]'::jsonb, true, '["Vitamin C (Ascorbic Acid)", "Rose Hips Extract", "Bioflavonoids", "Cellulose", "Stearic Acid"]'::jsonb, 
   'Vitamin C 1000mg with Rose Hips - Immune Support', 'High-potency Vitamin C supplement with rose hips for enhanced immune system support and antioxidant protection', 120, NOW() - (RANDOM() * INTERVAL '30 days')),
   
  ('Vitamin D3 5000 IU Softgels', 'vitamin-d3-5000-iu', 'High-potency Vitamin D3 supplement in easy-to-swallow softgels. Essential for bone health, calcium absorption, and immune function. Particularly important in regions with limited sunlight exposure. Supports muscle function and may help maintain healthy mood.', 'active', 5, '120 softgels', '5000 IU', 180, 45000, 1, (SELECT id FROM ecom_vit_category WHERE name = 'Vitamins'), (SELECT id FROM ecom_vit_brand WHERE name = 'Solgar'), 
   '["bone", "immune", "calcium", "mood"]'::jsonb, true, '["Vitamin D3 (Cholecalciferol)", "Extra Virgin Olive Oil", "Gelatin", "Glycerin"]'::jsonb, 
   'Vitamin D3 5000 IU - Bone & Immune Health', 'High-potency Vitamin D3 supplement essential for bone health, calcium absorption, and immune system support', 150, NOW() - (RANDOM() * INTERVAL '30 days')),
   
  ('Magnesium Glycinate 400mg', 'magnesium-glycinate-400mg', 'Highly bioavailable magnesium in glycinate form for maximum absorption and minimal digestive upset. Supports muscle relaxation, nerve function, and quality sleep. This chelated form is gentle on the stomach and ideal for those with sensitive digestion. Helps maintain normal muscle and nerve function.', 'active', 0, '120 tablets', '400 mg', 200, 65000, 2, (SELECT id FROM ecom_vit_category WHERE name = 'Minerals'), (SELECT id FROM ecom_vit_brand WHERE name = 'Nature''s Way'), 
   '["relaxation", "sleep", "muscle", "stress"]'::jsonb, false, '["Magnesium Glycinate", "Vegetable Cellulose", "Silica", "Stearic Acid"]'::jsonb, 
   'Magnesium Glycinate 400mg - Sleep & Relaxation', 'Highly bioavailable magnesium glycinate for better sleep, muscle relaxation, and stress management', 140, NOW() - (RANDOM() * INTERVAL '30 days')),
   
  ('Probiotic 50 Billion CFU', 'probiotic-50-billion-cfu', 'High-potency probiotic supplement with 50 billion CFU per capsule. Contains 10 diverse strains including Lactobacillus and Bifidobacterium species. Supports digestive health, immune function, and helps maintain healthy gut flora. Delayed-release capsules ensure probiotics reach the intestines alive.', 'active', 10, '60 capsules', '50 Billion', 150, 120000, 1, (SELECT id FROM ecom_vit_category WHERE name = 'Probiotics'), (SELECT id FROM ecom_vit_brand WHERE name = 'Garden of Life'), 
   '["digestive", "gut", "immunity", "bloating"]'::jsonb, true, '["Lactobacillus acidophilus", "Bifidobacterium lactis", "Lactobacillus plantarum", "Bifidobacterium bifidum", "Prebiotic Fiber"]'::jsonb, 
   'Probiotic 50 Billion CFU - Advanced Gut Health', 'High-potency multi-strain probiotic with 50 billion CFU for optimal digestive and immune health', 80, NOW() - (RANDOM() * INTERVAL '30 days')),
   
  ('Ashwagandha Root Extract 600mg', 'ashwagandha-root-extract-600mg', 'Standardized Ashwagandha root extract, an adaptogenic herb traditionally used in Ayurvedic medicine. Helps the body manage stress, supports healthy cortisol levels, and promotes calm energy. May improve sleep quality and support cognitive function. KSM-66 extract standardized to 5% withanolides.', 'active', 0, '120 capsules', '600 mg', 240, 75000, 2, (SELECT id FROM ecom_vit_category WHERE name = 'Herbal Supplements'), (SELECT id FROM ecom_vit_brand WHERE name = 'Doctor''s Best'), 
   '["stress", "adaptogen", "energy", "anxiety"]'::jsonb, false, '["Ashwagandha Root Extract (KSM-66)", "Gelatin Capsule", "Rice Flour"]'::jsonb, 
   'Ashwagandha 600mg - Stress & Energy Support', 'Standardized Ashwagandha extract for stress management, improved energy, and better sleep quality', 100, NOW() - (RANDOM() * INTERVAL '30 days')),
    
  ('Zinc Picolinate 50mg', 'zinc-picolinate-50mg', 'Highly absorbable zinc in picolinate form, essential for immune system function, wound healing, and cellular health. Supports healthy skin, vision, and may help reduce the duration of cold symptoms. Picolinate form ensures optimal bioavailability and absorption.', 'active', 0, '100 capsules', '50 mg', 170, 25000, 1, (SELECT id FROM ecom_vit_category WHERE name = 'Minerals'), (SELECT id FROM ecom_vit_brand WHERE name = 'NOW Foods'), 
   '["immune", "mineral", "recovery", "skin"]'::jsonb, false, '["Zinc Picolinate", "Brown Rice Flour", "Vegetable Cellulose"]'::jsonb, 
   'Zinc Picolinate 50mg - Immune & Skin Support', 'Highly bioavailable zinc picolinate for immune function, skin health, and faster recovery', 90, NOW() - (RANDOM() * INTERVAL '30 days')),
    
  ('Omega-3 Fish Oil 1200mg', 'omega-3-fish-oil-1200mg', 'Molecularly distilled fish oil providing high concentrations of EPA and DHA omega-3 fatty acids. Supports cardiovascular health, brain function, and helps reduce inflammation. Enteric-coated softgels prevent fishy aftertaste and ensure optimal absorption. Sourced from wild-caught fish.', 'active', 15, '180 softgels', '1200 mg', 160, 55000, 2, (SELECT id FROM ecom_vit_category WHERE name = 'Omega-3 & Fish Oils'), (SELECT id FROM ecom_vit_brand WHERE name = 'Solgar'), 
   '["heart", "brain", "inflammation", "cognitive"]'::jsonb, true, '["Fish Oil Concentrate", "EPA (Eicosapentaenoic Acid)", "DHA (Docosahexaenoic Acid)", "Natural Vitamin E", "Enteric Coating"]'::jsonb, 
   'Omega-3 Fish Oil 1200mg - Heart & Brain Health', 'High-potency molecularly distilled fish oil for cardiovascular health, brain function, and inflammation support', 200, NOW() - (RANDOM() * INTERVAL '30 days')),
    
  ('Turmeric Curcumin with Bioperine 1000mg', 'turmeric-curcumin-1000mg-bioperine', 'Standardized turmeric extract with 95% curcuminoids enhanced with Bioperine (black pepper extract) for 2000% better absorption. Supports joint comfort, healthy inflammation response, and provides powerful antioxidant protection. Ideal for active individuals and those with joint concerns.', 'active', 0, '120 capsules', '1000 mg', 190, 45000, 2, (SELECT id FROM ecom_vit_category WHERE name = 'Herbal Supplements'), (SELECT id FROM ecom_vit_brand WHERE name = 'Nature''s Way'), 
   '["anti-inflammatory", "joint", "antioxidant", "arthritis"]'::jsonb, false, '["Turmeric Root Extract (95% Curcuminoids)", "Bioperine (Black Pepper Extract)", "Gelatin Capsule", "Rice Flour"]'::jsonb, 
   'Turmeric Curcumin 1000mg - Joint & Inflammation Support', 'High-potency turmeric with Bioperine for enhanced absorption, joint comfort, and antioxidant protection', 110, NOW() - (RANDOM() * INTERVAL '30 days')),
    
  ('B-Complex with Methylated Folate', 'b-complex-methylated-folate', 'Complete B-vitamin complex with methylated forms of B12 and folate for optimal absorption. Supports energy metabolism, nervous system health, and helps manage stress. Includes all 8 essential B vitamins plus choline and inositol. Ideal for those with MTHFR gene variations.', 'active', 0, '100 tablets', '100 mg', 180, 35000, 1, (SELECT id FROM ecom_vit_category WHERE name = 'Vitamins'), (SELECT id FROM ecom_vit_brand WHERE name = 'Garden of Life'), 
   '["energy", "stress", "nervous", "metabolism"]'::jsonb, false, '["Thiamine (B1)", "Riboflavin (B2)", "Niacin (B3)", "Pantothenic Acid (B5)", "Pyridoxine (B6)", "Methylcobalamin (B12)", "Methylfolate", "Biotin", "Choline", "Inositol"]'::jsonb, 
   'B-Complex with Methylated Folate - Energy & Stress', 'Complete B-vitamin complex with methylated forms for optimal energy metabolism and stress management', 95, NOW() - (RANDOM() * INTERVAL '30 days')),
    
  ('CoQ10 Ubiquinol 200mg', 'coq10-ubiquinol-200mg', 'Advanced form of CoQ10 in the active ubiquinol form for superior absorption. Supports cardiovascular health, cellular energy production, and acts as a powerful antioxidant. Ubiquinol is the reduced, active form that''s more readily used by the body, especially important for those over 40.', 'active', 20, '60 softgels', '200 mg', 140, 95000, 1, (SELECT id FROM ecom_vit_category WHERE name = 'Vitamins'), (SELECT id FROM ecom_vit_brand WHERE name = 'Doctor''s Best'), 
   '["heart", "energy", "antioxidant", "cardiovascular"]'::jsonb, true, '["CoQ10 (Ubiquinol)", "Extra Virgin Olive Oil", "Softgel Capsule", "Natural Vitamin E"]'::jsonb, 
   'CoQ10 Ubiquinol 200mg - Heart & Cellular Energy', 'Bioavailable ubiquinol form of CoQ10 for cardiovascular health and cellular energy production', 70, NOW() - (RANDOM() * INTERVAL '30 days')),
    
  ('Vitamin K2 MK-7 200mcg', 'vitamin-k2-mk7-200mcg', 'Bioactive Vitamin K2 in the MK-7 form, derived from natto. Essential for directing calcium to bones and teeth while preventing calcification in arteries. Supports bone density and cardiovascular health. MK-7 has superior bioavailability and longer half-life compared to other forms.', 'active', 0, '120 capsules', '200 mcg', 160, 40000, 1, (SELECT id FROM ecom_vit_category WHERE name = 'Minerals'), (SELECT id FROM ecom_vit_brand WHERE name = 'NOW Foods'), 
   '["bone", "heart", "calcium", "osteoporosis"]'::jsonb, false, '["Vitamin K2 (Menaquinone-7)", "MCT Oil", "Gelatin Capsule"]'::jsonb, 
   'Vitamin K2 MK-7 200mcg - Bone & Heart Health', 'Bioactive Vitamin K2 MK-7 for proper calcium metabolism and cardiovascular health', 100, NOW() - (RANDOM() * INTERVAL '30 days')),
    
  ('Men''s Multivitamin 50+', 'mens-multivitamin-50-plus', 'Comprehensive multivitamin specifically formulated for men over 50. Includes higher levels of B vitamins, vitamin D, and zinc. Supports prostate health, energy levels, and overall wellness. Contains no iron to reduce risk of iron overload. Includes heart-healthy nutrients and antioxidants.', 'active', 0, '90 tablets', '1 tablet', 220, 55000, 1, (SELECT id FROM ecom_vit_category WHERE name = 'Multivitamins'), (SELECT id FROM ecom_vit_brand WHERE name = 'Solgar'), 
   '["daily", "men", "comprehensive", "senior"]'::jsonb, true, '["Vitamin A", "Vitamin C", "Vitamin D3", "Vitamin E", "B-Complex Vitamins", "Zinc", "Selenium", "Saw Palmetto", "Lycopene"]'::jsonb, 
   'Men''s Multivitamin 50+ - Complete Daily Nutrition', 'Comprehensive multivitamin formula optimized for men over 50 with prostate and heart health support', 120, NOW() - (RANDOM() * INTERVAL '30 days')),
    
  ('Iron Bisglycinate 25mg', 'iron-bisglycinate-25mg', 'Gentle, highly absorbable iron in bisglycinate chelate form. Causes minimal digestive upset compared to traditional iron supplements. Includes vitamin C for enhanced absorption. Supports healthy red blood cell production, energy levels, and prevents iron deficiency anemia. Ideal for women and vegetarians.', 'active', 0, '120 tablets', '25 mg', 190, 20000, 1, (SELECT id FROM ecom_vit_category WHERE name = 'Minerals'), (SELECT id FROM ecom_vit_brand WHERE name = 'Nature''s Way'), 
   '["energy", "blood", "anemia", "women"]'::jsonb, false, '["Iron Bisglycinate", "Vitamin C (Ascorbic Acid)", "Folic Acid", "Cellulose", "Stearic Acid"]'::jsonb, 
   'Iron Bisglycinate 25mg - Gentle Iron Supplement', 'Gentle, highly absorbable iron bisglycinate for energy support and healthy red blood cell production', 85, NOW() - (RANDOM() * INTERVAL '30 days')),
    
  ('Calcium Citrate with D3 & Magnesium', 'calcium-citrate-d3-magnesium', 'Complete bone support formula combining calcium citrate, vitamin D3, and magnesium. Citrate form is highly absorbable and doesn''t require stomach acid. Supports bone density, prevents osteoporosis, and maintains healthy teeth. Includes vitamin K2 for proper calcium utilization.', 'active', 0, '180 tablets', '600 mg', 170, 30000, 2, (SELECT id FROM ecom_vit_category WHERE name = 'Minerals'), (SELECT id FROM ecom_vit_brand WHERE name = 'Garden of Life'), 
   '["bone", "calcium", "teeth", "osteoporosis"]'::jsonb, false, '["Calcium Citrate", "Vitamin D3", "Magnesium", "Vitamin K2", "Zinc", "Boron"]'::jsonb, 
   'Calcium Citrate with D3 & Magnesium - Bone Health', 'Complete bone support formula with highly absorbable calcium citrate, vitamin D3, and magnesium', 150, NOW() - (RANDOM() * INTERVAL '30 days')),
    
  ('Digestive Enzymes Complete Formula', 'digestive-enzymes-complete', 'Comprehensive digestive enzyme blend supporting the breakdown of proteins, carbohydrates, fats, and fiber. Includes protease, amylase, lipase, lactase, and cellulase. Helps reduce bloating, gas, and supports nutrient absorption. Ideal for those with digestive discomfort or difficulty digesting certain foods.', 'active', 0, '90 capsules', '1 capsule', 150, 45000, 1, (SELECT id FROM ecom_vit_category WHERE name = 'Digestive Health'), (SELECT id FROM ecom_vit_brand WHERE name = 'Doctor''s Best'), 
   '["digestion", "enzymes", "bloating", "lactose"]'::jsonb, false, '["Protease", "Amylase", "Lipase", "Lactase", "Cellulase", "Bromelain", "Papain", "Betaine HCL"]'::jsonb, 
   'Digestive Enzymes Complete - Gut Health Support', 'Comprehensive enzyme blend for optimal digestion, nutrient absorption, and reduced digestive discomfort', 75, NOW() - (RANDOM() * INTERVAL '30 days'));

-- Seed Product Images (depends on Products) - Real vitamin/supplement product images from Unsplash
INSERT INTO ecom_vit_product_image (product_id, url, is_primary, created_at)
VALUES
  -- Vitamin C 1000mg with Rose Hips
  ((SELECT id FROM ecom_vit_product WHERE slug = 'vitamin-c-1000mg-rose-hips'), 'https://images.unsplash.com/photo-1550572017-edd951b55104?w=600&h=400&fit=crop&q=80', true, NOW() - (RANDOM() * INTERVAL '30 days')),
  ((SELECT id FROM ecom_vit_product WHERE slug = 'vitamin-c-1000mg-rose-hips'), 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&h=400&fit=crop&q=80', false, NOW() - (RANDOM() * INTERVAL '30 days')),
  -- Vitamin D3 5000 IU Softgels
  ((SELECT id FROM ecom_vit_product WHERE slug = 'vitamin-d3-5000-iu'), 'https://images.unsplash.com/photo-1607613009820-a29f7bb81c04?w=600&h=400&fit=crop&q=80', true, NOW() - (RANDOM() * INTERVAL '30 days')),
  ((SELECT id FROM ecom_vit_product WHERE slug = 'vitamin-d3-5000-iu'), 'https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=600&h=400&fit=crop&q=80', false, NOW() - (RANDOM() * INTERVAL '30 days')),
  -- Magnesium Glycinate 400mg
  ((SELECT id FROM ecom_vit_product WHERE slug = 'magnesium-glycinate-400mg'), 'https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=600&h=400&fit=crop&q=80', true, NOW() - (RANDOM() * INTERVAL '30 days')),
  ((SELECT id FROM ecom_vit_product WHERE slug = 'magnesium-glycinate-400mg'), 'https://images.unsplash.com/photo-1607613009820-a29f7bb81c04?w=600&h=400&fit=crop&q=80', false, NOW() - (RANDOM() * INTERVAL '30 days')),
  -- Probiotic 50 Billion CFU
  ((SELECT id FROM ecom_vit_product WHERE slug = 'probiotic-50-billion-cfu'), 'https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=600&h=400&fit=crop&q=80', true, NOW() - (RANDOM() * INTERVAL '30 days')),
  ((SELECT id FROM ecom_vit_product WHERE slug = 'probiotic-50-billion-cfu'), 'https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=600&h=400&fit=crop&q=80', false, NOW() - (RANDOM() * INTERVAL '30 days')),
  -- Ashwagandha Root Extract 600mg
  ((SELECT id FROM ecom_vit_product WHERE slug = 'ashwagandha-root-extract-600mg'), 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&h=400&fit=crop&q=80', true, NOW() - (RANDOM() * INTERVAL '30 days')),
  ((SELECT id FROM ecom_vit_product WHERE slug = 'ashwagandha-root-extract-600mg'), 'https://images.unsplash.com/photo-1550572017-edd951b55104?w=600&h=400&fit=crop&q=80', false, NOW() - (RANDOM() * INTERVAL '30 days')),
  -- Zinc Picolinate 50mg
  ((SELECT id FROM ecom_vit_product WHERE slug = 'zinc-picolinate-50mg'), 'https://images.unsplash.com/photo-1607613009820-a29f7bb81c04?w=600&h=400&fit=crop&q=80', true, NOW() - (RANDOM() * INTERVAL '30 days')),
  ((SELECT id FROM ecom_vit_product WHERE slug = 'zinc-picolinate-50mg'), 'https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=600&h=400&fit=crop&q=80', false, NOW() - (RANDOM() * INTERVAL '30 days')),
  -- Omega-3 Fish Oil 1200mg
  ((SELECT id FROM ecom_vit_product WHERE slug = 'omega-3-fish-oil-1200mg'), 'https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=600&h=400&fit=crop&q=80', true, NOW() - (RANDOM() * INTERVAL '30 days')),
  ((SELECT id FROM ecom_vit_product WHERE slug = 'omega-3-fish-oil-1200mg'), 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&h=400&fit=crop&q=80', false, NOW() - (RANDOM() * INTERVAL '30 days')),
  -- Turmeric Curcumin with Bioperine 1000mg
  ((SELECT id FROM ecom_vit_product WHERE slug = 'turmeric-curcumin-1000mg-bioperine'), 'https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=600&h=400&fit=crop&q=80', true, NOW() - (RANDOM() * INTERVAL '30 days')),
  ((SELECT id FROM ecom_vit_product WHERE slug = 'turmeric-curcumin-1000mg-bioperine'), 'https://images.unsplash.com/photo-1550572017-edd951b55104?w=600&h=400&fit=crop&q=80', false, NOW() - (RANDOM() * INTERVAL '30 days')),
  -- B-Complex with Methylated Folate
  ((SELECT id FROM ecom_vit_product WHERE slug = 'b-complex-methylated-folate'), 'https://images.unsplash.com/photo-1607613009820-a29f7bb81c04?w=600&h=400&fit=crop&q=80', true, NOW() - (RANDOM() * INTERVAL '30 days')),
  ((SELECT id FROM ecom_vit_product WHERE slug = 'b-complex-methylated-folate'), 'https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=600&h=400&fit=crop&q=80', false, NOW() - (RANDOM() * INTERVAL '30 days')),
  -- CoQ10 Ubiquinol 200mg
  ((SELECT id FROM ecom_vit_product WHERE slug = 'coq10-ubiquinol-200mg'), 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&h=400&fit=crop&q=80', true, NOW() - (RANDOM() * INTERVAL '30 days')),
  ((SELECT id FROM ecom_vit_product WHERE slug = 'coq10-ubiquinol-200mg'), 'https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=600&h=400&fit=crop&q=80', false, NOW() - (RANDOM() * INTERVAL '30 days')),
  -- Vitamin K2 MK-7 200mcg
  ((SELECT id FROM ecom_vit_product WHERE slug = 'vitamin-k2-mk7-200mcg'), 'https://images.unsplash.com/photo-1550572017-edd951b55104?w=600&h=400&fit=crop&q=80', true, NOW() - (RANDOM() * INTERVAL '30 days')),
  ((SELECT id FROM ecom_vit_product WHERE slug = 'vitamin-k2-mk7-200mcg'), 'https://images.unsplash.com/photo-1607613009820-a29f7bb81c04?w=600&h=400&fit=crop&q=80', false, NOW() - (RANDOM() * INTERVAL '30 days')),
  -- Men's Multivitamin 50+
  ((SELECT id FROM ecom_vit_product WHERE slug = 'mens-multivitamin-50-plus'), 'https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=600&h=400&fit=crop&q=80', true, NOW() - (RANDOM() * INTERVAL '30 days')),
  ((SELECT id FROM ecom_vit_product WHERE slug = 'mens-multivitamin-50-plus'), 'https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=600&h=400&fit=crop&q=80', false, NOW() - (RANDOM() * INTERVAL '30 days')),
  -- Iron Bisglycinate 25mg
  ((SELECT id FROM ecom_vit_product WHERE slug = 'iron-bisglycinate-25mg'), 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&h=400&fit=crop&q=80', true, NOW() - (RANDOM() * INTERVAL '30 days')),
  ((SELECT id FROM ecom_vit_product WHERE slug = 'iron-bisglycinate-25mg'), 'https://images.unsplash.com/photo-1550572017-edd951b55104?w=600&h=400&fit=crop&q=80', false, NOW() - (RANDOM() * INTERVAL '30 days')),
  -- Calcium Citrate with D3 & Magnesium
  ((SELECT id FROM ecom_vit_product WHERE slug = 'calcium-citrate-d3-magnesium'), 'https://images.unsplash.com/photo-1607613009820-a29f7bb81c04?w=600&h=400&fit=crop&q=80', true, NOW() - (RANDOM() * INTERVAL '30 days')),
  ((SELECT id FROM ecom_vit_product WHERE slug = 'calcium-citrate-d3-magnesium'), 'https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=600&h=400&fit=crop&q=80', false, NOW() - (RANDOM() * INTERVAL '30 days')),
  -- Digestive Enzymes Complete Formula
  ((SELECT id FROM ecom_vit_product WHERE slug = 'digestive-enzymes-complete'), 'https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=600&h=400&fit=crop&q=80', true, NOW() - (RANDOM() * INTERVAL '30 days')),
  ((SELECT id FROM ecom_vit_product WHERE slug = 'digestive-enzymes-complete'), 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&h=400&fit=crop&q=80', false, NOW() - (RANDOM() * INTERVAL '30 days'));

-- Seed Customers (independent table) - Mongolian addresses and phone numbers
INSERT INTO ecom_vit_customer (phone, address, created_at)
VALUES
  (99123456, 'Баянзүрх дүүрэг, 1-р хороо, Нарны гудамж 15, байр 23', NOW() - (RANDOM() * INTERVAL '30 days')),
  (99234567, 'Сонгинохайрхан дүүрэг, 5-р хороо, Чингис хааны өргөн чөлөө 42, байр 8', NOW() - (RANDOM() * INTERVAL '30 days')),
  (99345678, 'Сүхбаатар дүүрэг, 2-р хороо, Энхтайвны өргөн чөлөө 78, байр 12', NOW() - (RANDOM() * INTERVAL '30 days')),
  (99456789, 'Хан-Уул дүүрэг, 3-р хороо, Жуулчны гудамж 34, байр 5', NOW() - (RANDOM() * INTERVAL '30 days')),
  (99567890, 'Баянгол дүүрэг, 4-р хороо, Сэлбийн гудамж 56, байр 19', NOW() - (RANDOM() * INTERVAL '30 days')),
  (99678901, 'Чингэлтэй дүүрэг, 6-р хороо, Олимпийн гудамж 89, байр 7', NOW() - (RANDOM() * INTERVAL '30 days')),
  (99789012, 'Баянзүрх дүүрэг, 7-р хороо, Их наран гудамж 123, байр 45', NOW() - (RANDOM() * INTERVAL '30 days')),
  (99890123, 'Сонгинохайрхан дүүрэг, 8-р хороо, Зайсан гудамж 67, байр 11', NOW() - (RANDOM() * INTERVAL '30 days')),
  (99901234, 'Сүхбаатар дүүрэг, 9-р хороо, Жамъян гүний гудамж 91, байр 3', NOW() - (RANDOM() * INTERVAL '30 days')),
  (99012345, 'Хан-Уул дүүрэг, 10-р хороо, Буддын гудамж 145, байр 28', NOW() - (RANDOM() * INTERVAL '30 days')),
  (99111222, 'Баянгол дүүрэг, 11-р хороо, Цагаан элэгний гудамж 23, байр 14', NOW() - (RANDOM() * INTERVAL '30 days')),
  (99222333, 'Чингэлтэй дүүрэг, 12-р хороо, Нарантуул гудамж 167, байр 9', NOW() - (RANDOM() * INTERVAL '30 days')),
  (99333444, 'Баянзүрх дүүрэг, 13-р хороо, Төв гудамж 201, байр 22', NOW() - (RANDOM() * INTERVAL '30 days')),
  (99444555, 'Сонгинохайрхан дүүрэг, 14-р хороо, Худалдааны төв гудамж 45, байр 6', NOW() - (RANDOM() * INTERVAL '30 days')),
  (99555666, 'Сүхбаатар дүүрэг, 15-р хороо, Соёлын төв гудамж 112, байр 17', NOW() - (RANDOM() * INTERVAL '30 days'));

-- Seed Purchases (depends on Products)
INSERT INTO ecom_vit_purchase (product_id, quantity_purchased, unit_cost, created_at)
VALUES
  ((SELECT id FROM ecom_vit_product WHERE slug = 'vitamin-c-1000mg-rose-hips'), 200, 24500, NOW() - (RANDOM() * INTERVAL '30 days')),
  ((SELECT id FROM ecom_vit_product WHERE slug = 'vitamin-d3-5000-iu'), 150, 31500, NOW() - (RANDOM() * INTERVAL '30 days')),
  ((SELECT id FROM ecom_vit_product WHERE slug = 'magnesium-glycinate-400mg'), 180, 45500, NOW() - (RANDOM() * INTERVAL '30 days')),
  ((SELECT id FROM ecom_vit_product WHERE slug = 'probiotic-50-billion-cfu'), 120, 84000, NOW() - (RANDOM() * INTERVAL '30 days')),
  ((SELECT id FROM ecom_vit_product WHERE slug = 'ashwagandha-root-extract-600mg'), 220, 52500, NOW() - (RANDOM() * INTERVAL '30 days')),
  ((SELECT id FROM ecom_vit_product WHERE slug = 'zinc-picolinate-50mg'), 160, 17500, NOW() - (RANDOM() * INTERVAL '30 days')),
  ((SELECT id FROM ecom_vit_product WHERE slug = 'omega-3-fish-oil-1200mg'), 140, 38500, NOW() - (RANDOM() * INTERVAL '30 days')),
  ((SELECT id FROM ecom_vit_product WHERE slug = 'turmeric-curcumin-1000mg-bioperine'), 190, 31500, NOW() - (RANDOM() * INTERVAL '30 days')),
  ((SELECT id FROM ecom_vit_product WHERE slug = 'b-complex-methylated-folate'), 170, 24500, NOW() - (RANDOM() * INTERVAL '30 days')),
  ((SELECT id FROM ecom_vit_product WHERE slug = 'coq10-ubiquinol-200mg'), 130, 66500, NOW() - (RANDOM() * INTERVAL '30 days')),
  ((SELECT id FROM ecom_vit_product WHERE slug = 'vitamin-k2-mk7-200mcg'), 150, 28000, NOW() - (RANDOM() * INTERVAL '30 days')),
  ((SELECT id FROM ecom_vit_product WHERE slug = 'mens-multivitamin-50-plus'), 200, 38500, NOW() - (RANDOM() * INTERVAL '30 days')),
  ((SELECT id FROM ecom_vit_product WHERE slug = 'iron-bisglycinate-25mg'), 180, 14000, NOW() - (RANDOM() * INTERVAL '30 days')),
  ((SELECT id FROM ecom_vit_product WHERE slug = 'calcium-citrate-d3-magnesium'), 160, 21000, NOW() - (RANDOM() * INTERVAL '30 days')),
  ((SELECT id FROM ecom_vit_product WHERE slug = 'digestive-enzymes-complete'), 140, 31500, NOW() - (RANDOM() * INTERVAL '30 days'));

UPDATE ecom_vit_product SET stock = stock + 200 WHERE slug = 'vitamin-c-1000mg-rose-hips';
UPDATE ecom_vit_product SET stock = stock + 150 WHERE slug = 'vitamin-d3-5000-iu';
UPDATE ecom_vit_product SET stock = stock + 180 WHERE slug = 'magnesium-glycinate-400mg';
UPDATE ecom_vit_product SET stock = stock + 120 WHERE slug = 'probiotic-50-billion-cfu';
UPDATE ecom_vit_product SET stock = stock + 220 WHERE slug = 'ashwagandha-root-extract-600mg';
UPDATE ecom_vit_product SET stock = stock + 160 WHERE slug = 'zinc-picolinate-50mg';
UPDATE ecom_vit_product SET stock = stock + 140 WHERE slug = 'omega-3-fish-oil-1200mg';
UPDATE ecom_vit_product SET stock = stock + 190 WHERE slug = 'turmeric-curcumin-1000mg-bioperine';
UPDATE ecom_vit_product SET stock = stock + 170 WHERE slug = 'b-complex-methylated-folate';
UPDATE ecom_vit_product SET stock = stock + 130 WHERE slug = 'coq10-ubiquinol-200mg';
UPDATE ecom_vit_product SET stock = stock + 150 WHERE slug = 'vitamin-k2-mk7-200mcg';
UPDATE ecom_vit_product SET stock = stock + 200 WHERE slug = 'mens-multivitamin-50-plus';
UPDATE ecom_vit_product SET stock = stock + 180 WHERE slug = 'iron-bisglycinate-25mg';
UPDATE ecom_vit_product SET stock = stock + 160 WHERE slug = 'calcium-citrate-d3-magnesium';
UPDATE ecom_vit_product SET stock = stock + 140 WHERE slug = 'digestive-enzymes-complete';

-- Seed Orders (depends on Customers) - Updated with Mongolian addresses
INSERT INTO ecom_vit_order (order_number, customer_phone, status, address, delivery_provider, total, notes, created_at)
VALUES
  ('A1B2C3D4', 99123456, 'delivered', 'Баянзүрх дүүрэг, 1-р хороо, Нарны гудамж 15, байр 23', 'tu-delivery', 100000, NULL, NOW() - (RANDOM() * INTERVAL '30 days')),
  ('E5F6G7H8', 99234567, 'pending', 'Сонгинохайрхан дүүрэг, 5-р хороо, Чингис хааны өргөн чөлөө 42, байр 8', 'self', 155000, 'Хаалганы ард үлдээх', NOW() - (RANDOM() * INTERVAL '30 days')),
  ('J1K2L3M4', 99345678, 'shipped', 'Сүхбаатар дүүрэг, 2-р хороо, Энхтайвны өргөн чөлөө 78, байр 12', 'avidaa', 120000, NULL, NOW() - (RANDOM() * INTERVAL '30 days')),
  ('N5P6Q7R8', 99456789, 'delivered', 'Хан-Уул дүүрэг, 3-р хороо, Жуулчны гудамж 34, байр 5', 'tu-delivery', 145000, 'Хонх дуудах', NOW() - (RANDOM() * INTERVAL '30 days')),
  ('S1T2U3V4', 99567890, 'cancelled', 'Баянгол дүүрэг, 4-р хороо, Сэлбийн гудамж 56, байр 19', 'self', 85000, 'Харилцагч дуудсан', NOW() - (RANDOM() * INTERVAL '30 days')),
  ('W5X6Y7Z8', 99678901, 'delivered', 'Чингэлтэй дүүрэг, 6-р хороо, Олимпийн гудамж 89, байр 7', 'tu-delivery', 112000, NULL, NOW() - (RANDOM() * INTERVAL '30 days')),
  ('A9B8C7D6', 99789012, 'pending', 'Баянзүрх дүүрэг, 7-р хороо, Их наран гудамж 123, байр 45', 'avidaa', 178000, 'Болгоомжтой ачих', NOW() - (RANDOM() * INTERVAL '30 days')),
  ('E1F2G3H4', 99890123, 'shipped', 'Сонгинохайрхан дүүрэг, 8-р хороо, Зайсан гудамж 67, байр 11', 'self', 93000, NULL, NOW() - (RANDOM() * INTERVAL '30 days')),
  ('I5J6K7L8', 99901234, 'delivered', 'Сүхбаатар дүүрэг, 9-р хороо, Жамъян гүний гудамж 91, байр 3', 'tu-delivery', 234000, 'Харилцагч оройн цагт хүлээн авахыг илүүд үздэг', NOW() - (RANDOM() * INTERVAL '30 days')),
  ('M9N8O7P6', 99012345, 'pending', 'Хан-Уул дүүрэг, 10-р хороо, Буддын гудамж 145, байр 28', 'self', 156000, NULL, NOW() - (RANDOM() * INTERVAL '30 days'));

-- Seed Order Details (depends on Orders, Products)
INSERT INTO ecom_vit_order_detail (order_id, product_id, quantity, created_at)
VALUES
  ((SELECT id FROM ecom_vit_order WHERE order_number = 'A1B2C3D4'), (SELECT id FROM ecom_vit_product WHERE slug = 'vitamin-c-1000mg-rose-hips'), 2, NOW() - (RANDOM() * INTERVAL '30 days')),
  ((SELECT id FROM ecom_vit_order WHERE order_number = 'A1B2C3D4'), (SELECT id FROM ecom_vit_product WHERE slug = 'vitamin-d3-5000-iu'), 1, NOW() - (RANDOM() * INTERVAL '30 days')),
  ((SELECT id FROM ecom_vit_order WHERE order_number = 'E5F6G7H8'), (SELECT id FROM ecom_vit_product WHERE slug = 'magnesium-glycinate-400mg'), 1, NOW() - (RANDOM() * INTERVAL '30 days')),
  ((SELECT id FROM ecom_vit_order WHERE order_number = 'E5F6G7H8'), (SELECT id FROM ecom_vit_product WHERE slug = 'probiotic-50-billion-cfu'), 1, NOW() - (RANDOM() * INTERVAL '30 days')),
  ((SELECT id FROM ecom_vit_order WHERE order_number = 'J1K2L3M4'), (SELECT id FROM ecom_vit_product WHERE slug = 'ashwagandha-root-extract-600mg'), 1, NOW() - (RANDOM() * INTERVAL '30 days')),
  ((SELECT id FROM ecom_vit_order WHERE order_number = 'N5P6Q7R8'), (SELECT id FROM ecom_vit_product WHERE slug = 'probiotic-50-billion-cfu'), 1, NOW() - (RANDOM() * INTERVAL '30 days')),
  ((SELECT id FROM ecom_vit_order WHERE order_number = 'N5P6Q7R8'), (SELECT id FROM ecom_vit_product WHERE slug = 'magnesium-glycinate-400mg'), 1, NOW() - (RANDOM() * INTERVAL '30 days')),
  ((SELECT id FROM ecom_vit_order WHERE order_number = 'S1T2U3V4'), (SELECT id FROM ecom_vit_product WHERE slug = 'vitamin-d3-5000-iu'), 1, NOW() - (RANDOM() * INTERVAL '30 days')),
  ((SELECT id FROM ecom_vit_order WHERE order_number = 'S1T2U3V4'), (SELECT id FROM ecom_vit_product WHERE slug = 'vitamin-c-1000mg-rose-hips'), 1, NOW() - (RANDOM() * INTERVAL '30 days')),
  ((SELECT id FROM ecom_vit_order WHERE order_number = 'W5X6Y7Z8'), (SELECT id FROM ecom_vit_product WHERE slug = 'zinc-picolinate-50mg'), 2, NOW() - (RANDOM() * INTERVAL '30 days')),
  ((SELECT id FROM ecom_vit_order WHERE order_number = 'W5X6Y7Z8'), (SELECT id FROM ecom_vit_product WHERE slug = 'omega-3-fish-oil-1200mg'), 1, NOW() - (RANDOM() * INTERVAL '30 days')),
  ((SELECT id FROM ecom_vit_order WHERE order_number = 'A9B8C7D6'), (SELECT id FROM ecom_vit_product WHERE slug = 'turmeric-curcumin-1000mg-bioperine'), 1, NOW() - (RANDOM() * INTERVAL '30 days')),
  ((SELECT id FROM ecom_vit_order WHERE order_number = 'A9B8C7D6'), (SELECT id FROM ecom_vit_product WHERE slug = 'b-complex-methylated-folate'), 2, NOW() - (RANDOM() * INTERVAL '30 days')),
  ((SELECT id FROM ecom_vit_order WHERE order_number = 'A9B8C7D6'), (SELECT id FROM ecom_vit_product WHERE slug = 'coq10-ubiquinol-200mg'), 1, NOW() - (RANDOM() * INTERVAL '30 days')),
  ((SELECT id FROM ecom_vit_order WHERE order_number = 'E1F2G3H4'), (SELECT id FROM ecom_vit_product WHERE slug = 'vitamin-k2-mk7-200mcg'), 1, NOW() - (RANDOM() * INTERVAL '30 days')),
  ((SELECT id FROM ecom_vit_order WHERE order_number = 'E1F2G3H4'), (SELECT id FROM ecom_vit_product WHERE slug = 'mens-multivitamin-50-plus'), 1, NOW() - (RANDOM() * INTERVAL '30 days')),
  ((SELECT id FROM ecom_vit_order WHERE order_number = 'I5J6K7L8'), (SELECT id FROM ecom_vit_product WHERE slug = 'iron-bisglycinate-25mg'), 2, NOW() - (RANDOM() * INTERVAL '30 days')),
  ((SELECT id FROM ecom_vit_order WHERE order_number = 'I5J6K7L8'), (SELECT id FROM ecom_vit_product WHERE slug = 'calcium-citrate-d3-magnesium'), 1, NOW() - (RANDOM() * INTERVAL '30 days')),
  ((SELECT id FROM ecom_vit_order WHERE order_number = 'I5J6K7L8'), (SELECT id FROM ecom_vit_product WHERE slug = 'digestive-enzymes-complete'), 1, NOW() - (RANDOM() * INTERVAL '30 days')),
  ((SELECT id FROM ecom_vit_order WHERE order_number = 'M9N8O7P6'), (SELECT id FROM ecom_vit_product WHERE slug = 'vitamin-c-1000mg-rose-hips'), 1, NOW() - (RANDOM() * INTERVAL '30 days')),
  ((SELECT id FROM ecom_vit_order WHERE order_number = 'M9N8O7P6'), (SELECT id FROM ecom_vit_product WHERE slug = 'ashwagandha-root-extract-600mg'), 1, NOW() - (RANDOM() * INTERVAL '30 days')),
  ((SELECT id FROM ecom_vit_order WHERE order_number = 'M9N8O7P6'), (SELECT id FROM ecom_vit_product WHERE slug = 'turmeric-curcumin-1000mg-bioperine'), 1, NOW() - (RANDOM() * INTERVAL '30 days'));

-- Seed Payments (depends on Orders)
INSERT INTO ecom_vit_payment (payment_number, order_id, provider, status, amount, created_at)
VALUES
  ('A1B2C3D4E5', (SELECT id FROM ecom_vit_order WHERE order_number = 'A1B2C3D4'), 'transfer', 'success', 100000, NOW() - (RANDOM() * INTERVAL '30 days')),
  ('F6G7H8I9J0', (SELECT id FROM ecom_vit_order WHERE order_number = 'E5F6G7H8'), 'qpay', 'pending', 155000, NOW() - (RANDOM() * INTERVAL '30 days')),
  ('K1L2M3N4O5', (SELECT id FROM ecom_vit_order WHERE order_number = 'J1K2L3M4'), 'cash', 'success', 120000, NOW() - (RANDOM() * INTERVAL '30 days')),
  ('P6Q7R8S9T0', (SELECT id FROM ecom_vit_order WHERE order_number = 'N5P6Q7R8'), 'transfer', 'success', 145000, NOW() - (RANDOM() * INTERVAL '30 days')),
  ('U1V2W3X4Y5', (SELECT id FROM ecom_vit_order WHERE order_number = 'S1T2U3V4'), 'cash', 'failed', 85000, NOW() - (RANDOM() * INTERVAL '30 days')),
  ('Z6A7B8C9D0', (SELECT id FROM ecom_vit_order WHERE order_number = 'W5X6Y7Z8'), 'qpay', 'success', 112000, NOW() - (RANDOM() * INTERVAL '30 days')),
  ('E1F2G3H4I5', (SELECT id FROM ecom_vit_order WHERE order_number = 'A9B8C7D6'), 'transfer', 'pending', 178000, NOW() - (RANDOM() * INTERVAL '30 days')),
  ('J6K7L8M9N0', (SELECT id FROM ecom_vit_order WHERE order_number = 'E1F2G3H4'), 'cash', 'success', 93000, NOW() - (RANDOM() * INTERVAL '30 days')),
  ('O1P2Q3R4S5', (SELECT id FROM ecom_vit_order WHERE order_number = 'I5J6K7L8'), 'qpay', 'success', 234000, NOW() - (RANDOM() * INTERVAL '30 days')),
  ('T6U7V8W9X0', (SELECT id FROM ecom_vit_order WHERE order_number = 'M9N8O7P6'), 'transfer', 'pending', 156000, NOW() - (RANDOM() * INTERVAL '30 days'));

-- Seed Sales (depends on Products, Orders) - Only for successful payments
INSERT INTO ecom_vit_sales (product_id, order_id, quantity_sold, product_cost, selling_price, discount_applied, created_at)
VALUES
  ((SELECT id FROM ecom_vit_product WHERE slug = 'vitamin-c-1000mg-rose-hips'), (SELECT id FROM ecom_vit_order WHERE order_number = 'A1B2C3D4'), 2, 24500, 35000, 0, (SELECT created_at FROM ecom_vit_order WHERE order_number = 'A1B2C3D4')),
  ((SELECT id FROM ecom_vit_product WHERE slug = 'vitamin-d3-5000-iu'), (SELECT id FROM ecom_vit_order WHERE order_number = 'A1B2C3D4'), 1, 31500, 45000, 0, (SELECT created_at FROM ecom_vit_order WHERE order_number = 'A1B2C3D4')),
  ((SELECT id FROM ecom_vit_product WHERE slug = 'ashwagandha-root-extract-600mg'), (SELECT id FROM ecom_vit_order WHERE order_number = 'J1K2L3M4'), 1, 52500, 75000, 0, (SELECT created_at FROM ecom_vit_order WHERE order_number = 'J1K2L3M4')),
  ((SELECT id FROM ecom_vit_product WHERE slug = 'probiotic-50-billion-cfu'), (SELECT id FROM ecom_vit_order WHERE order_number = 'N5P6Q7R8'), 1, 84000, 120000, 0, (SELECT created_at FROM ecom_vit_order WHERE order_number = 'N5P6Q7R8')),
  ((SELECT id FROM ecom_vit_product WHERE slug = 'magnesium-glycinate-400mg'), (SELECT id FROM ecom_vit_order WHERE order_number = 'N5P6Q7R8'), 1, 45500, 65000, 0, (SELECT created_at FROM ecom_vit_order WHERE order_number = 'N5P6Q7R8')),
  ((SELECT id FROM ecom_vit_product WHERE slug = 'zinc-picolinate-50mg'), (SELECT id FROM ecom_vit_order WHERE order_number = 'W5X6Y7Z8'), 2, 17500, 25000, 0, (SELECT created_at FROM ecom_vit_order WHERE order_number = 'W5X6Y7Z8')),
  ((SELECT id FROM ecom_vit_product WHERE slug = 'omega-3-fish-oil-1200mg'), (SELECT id FROM ecom_vit_order WHERE order_number = 'W5X6Y7Z8'), 1, 38500, 55000, 0, (SELECT created_at FROM ecom_vit_order WHERE order_number = 'W5X6Y7Z8')),
  ((SELECT id FROM ecom_vit_product WHERE slug = 'vitamin-k2-mk7-200mcg'), (SELECT id FROM ecom_vit_order WHERE order_number = 'E1F2G3H4'), 1, 28000, 40000, 0, (SELECT created_at FROM ecom_vit_order WHERE order_number = 'E1F2G3H4')),
  ((SELECT id FROM ecom_vit_product WHERE slug = 'mens-multivitamin-50-plus'), (SELECT id FROM ecom_vit_order WHERE order_number = 'E1F2G3H4'), 1, 38500, 55000, 0, (SELECT created_at FROM ecom_vit_order WHERE order_number = 'E1F2G3H4')),
  ((SELECT id FROM ecom_vit_product WHERE slug = 'iron-bisglycinate-25mg'), (SELECT id FROM ecom_vit_order WHERE order_number = 'I5J6K7L8'), 2, 14000, 20000, 0, (SELECT created_at FROM ecom_vit_order WHERE order_number = 'I5J6K7L8')),
  ((SELECT id FROM ecom_vit_product WHERE slug = 'calcium-citrate-d3-magnesium'), (SELECT id FROM ecom_vit_order WHERE order_number = 'I5J6K7L8'), 1, 21000, 30000, 0, (SELECT created_at FROM ecom_vit_order WHERE order_number = 'I5J6K7L8')),
  ((SELECT id FROM ecom_vit_product WHERE slug = 'digestive-enzymes-complete'), (SELECT id FROM ecom_vit_order WHERE order_number = 'I5J6K7L8'), 1, 31500, 45000, 0, (SELECT created_at FROM ecom_vit_order WHERE order_number = 'I5J6K7L8'));

UPDATE ecom_vit_product SET stock = stock - 2 WHERE slug = 'vitamin-c-1000mg-rose-hips';
UPDATE ecom_vit_product SET stock = stock - 1 WHERE slug = 'vitamin-d3-5000-iu';
UPDATE ecom_vit_product SET stock = stock - 1 WHERE slug = 'ashwagandha-root-extract-600mg';
UPDATE ecom_vit_product SET stock = stock - 1 WHERE slug = 'probiotic-50-billion-cfu';
UPDATE ecom_vit_product SET stock = stock - 1 WHERE slug = 'magnesium-glycinate-400mg';
UPDATE ecom_vit_product SET stock = stock - 2 WHERE slug = 'zinc-picolinate-50mg';
UPDATE ecom_vit_product SET stock = stock - 1 WHERE slug = 'omega-3-fish-oil-1200mg';
UPDATE ecom_vit_product SET stock = stock - 1 WHERE slug = 'vitamin-k2-mk7-200mcg';
UPDATE ecom_vit_product SET stock = stock - 1 WHERE slug = 'mens-multivitamin-50-plus';
UPDATE ecom_vit_product SET stock = stock - 2 WHERE slug = 'iron-bisglycinate-25mg';
UPDATE ecom_vit_product SET stock = stock - 1 WHERE slug = 'calcium-citrate-d3-magnesium';
UPDATE ecom_vit_product SET stock = stock - 1 WHERE slug = 'digestive-enzymes-complete';

