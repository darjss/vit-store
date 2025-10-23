-- Cloudflare D1 Compatible Seeding Script
-- No transactions, proper foreign key order, all schema fields included

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

-- Seed Users (independent table)
INSERT INTO ecom_vit_user (id, username, is_approved, created_at)
VALUES
  (1, 'admin', 1, (strftime('%s','now') - (abs(random()) % 2592000))),
  (2, 'staff1', 1, (strftime('%s','now') - (abs(random()) % 2592000))),
  (3, 'staff2', 0, (strftime('%s','now') - (abs(random()) % 2592000)));

-- Seed Brands (independent table)
INSERT INTO ecom_vit_brand (id, name, logo_url, created_at)
VALUES
  (1, 'NOW Foods', 'https://picsum.photos/600/400?random=26', (strftime('%s','now') - (abs(random()) % 2592000))),
  (2, 'Nature''s Best', 'https://picsum.photos/600/400?random=27', (strftime('%s','now') - (abs(random()) % 2592000))),
  (3, 'Microingredients', 'https://picsum.photos/600/400?random=28', (strftime('%s','now') - (abs(random()) % 2592000))),
  (4, 'NutraCost', 'https://picsum.photos/600/400?random=29', (strftime('%s','now') - (abs(random()) % 2592000))),
  (5, 'Doctor''s Best', 'https://picsum.photos/600/400?random=30', (strftime('%s','now') - (abs(random()) % 2592000)));

-- Seed Categories (independent table)
INSERT INTO ecom_vit_category (id, name, created_at)
VALUES
  (1, 'Vitamins', (strftime('%s','now') - (abs(random()) % 2592000))),
  (2, 'Minerals', (strftime('%s','now') - (abs(random()) % 2592000))),
  (3, 'Herbal Supplements', (strftime('%s','now') - (abs(random()) % 2592000))),
  (4, 'Probiotics', (strftime('%s','now') - (abs(random()) % 2592000))),
  (5, 'Energy Supplements', (strftime('%s','now') - (abs(random()) % 2592000)));

-- Seed Products (depends on Brands, Categories)
INSERT INTO ecom_vit_product (
  id, name, slug, description, status, discount, amount, potency, stock, price, 
  daily_intake, category_id, brand_id, tags, is_featured, ingredients, 
  seo_title, seo_description, weight_grams, created_at
) VALUES
  (1,  'Vitamin C 500mg', 'vitamin-c-500mg', 'High potency Vitamin C with rose hips', 'active', 0, '100 tablets', '500 mg', 200, 25000, 2, 1, 1, 
   '["immune", "antioxidant", "cold"]', 1, '["Vitamin C", "Rose Hips", "Bioflavonoids"]', 
   'Vitamin C 500mg - Immune Support', 'High potency Vitamin C supplement with immune support benefits', 100, (strftime('%s','now') - (abs(random()) % 2592000))),
   
  (2,  'Vitamin D3 2000 IU', 'vitamin-d3-2000-iu', 'Vitamin D3 support for bone health', 'active', 0, '120 softgels', '2000 IU', 150, 30000, 1, 1, 2, 
   '["bone", "immune", "sunshine"]', 1, '["Vitamin D3", "Olive Oil"]', 
   'Vitamin D3 2000 IU - Bone Health', 'Essential Vitamin D3 for calcium absorption and bone health', 120, (strftime('%s','now') - (abs(random()) % 2592000))),
   
  (3,  'Magnesium Glycinate 120 Tablets', 'magnesium-glycinate-120-tablets', 'Magnesium for relaxation and sleep', 'active', 0, '120 tablets', '200 mg', 180, 55000, 2, 2, 3, 
   '["relaxation", "sleep", "muscle"]', 0, '["Magnesium Glycinate", "Cellulose"]', 
   'Magnesium Glycinate - Calm Support', 'Highly bioavailable magnesium for relaxation and better sleep', 120, (strftime('%s','now') - (abs(random()) % 2592000))),
   
  (4,  'Probiotic Complex 30 Billion', 'probiotic-complex-30-billion', '30B CFU probiotic with multiple strains', 'active', 0, '60 capsules', '30 Billion', 120, 90000, 1, 4, 4, 
   '["digestive", "gut", "immunity"]', 1, '["Lactobacillus", "Bifidobacterium", "Prebiotics"]', 
   'Probiotic 30 Billion - Gut Health', 'Multi-strain probiotic for digestive and immune health', 60, (strftime('%s','now') - (abs(random()) % 2592000))),
   
(5,  'Ashwagandha 1000mg', 'ashwagandha-1000mg', 'Stress support Ashwagandha extract', 'active', 0, '120 capsules', '1000 mg', 220, 65000, 2, 3, 5, 
    '["stress", "adaptogen", "energy"]', 0, '["Ashwagandha Root Extract", "Black Pepper"]', 
    'Ashwagandha 1000mg - Stress Relief', 'Adaptogenic herb for stress management and energy', 120, (strftime('%s','now') - (abs(random()) % 2592000))),
    
   (6,  'Zinc Picolinate 30mg', 'zinc-picolinate-30mg', 'High absorption zinc for immune support', 'active', 0, '100 capsules', '30 mg', 160, 18000, 1, 2, 1, 
    '["immune", "mineral", "recovery"]', 0, '["Zinc Picolinate", "Rice Flour"]', 
    'Zinc Picolinate 30mg - Immune Support', 'Essential mineral for immune function and cellular health', 100, (strftime('%s','now') - (abs(random()) % 2592000))),
    
   (7,  'Omega-3 Fish Oil 1000mg', 'omega-3-fish-oil-1000mg', 'EPA/DHA omega-3 fatty acids', 'active', 0, '180 softgels', '1000 mg', 140, 45000, 2, 1, 2, 
    '["heart", "brain", "inflammation"]', 1, '["Fish Oil", "EPA", "DHA", "Vitamin E"]', 
    'Omega-3 Fish Oil - Heart & Brain Health', 'Molecularly distilled fish oil for cardiovascular and cognitive support', 180, (strftime('%s','now') - (abs(random()) % 2592000))),
    
   (8,  'Turmeric Curcumin 500mg', 'turmeric-curcumin-500mg', 'Anti-inflammatory turmeric with black pepper', 'active', 0, '120 capsules', '500 mg', 190, 35000, 2, 3, 3, 
    '["anti-inflammatory", "joint", "antioxidant"]', 0, '["Turmeric Root Extract", "Black Pepper Extract"]', 
    'Turmeric Curcumin 500mg - Joint Support', 'Standardized turmeric extract for joint comfort and antioxidant protection', 120, (strftime('%s','now') - (abs(random()) % 2592000))),
    
   (9,  'B-Complex 100', 'b-complex-100', 'Complete B-vitamin complex', 'active', 0, '100 tablets', '100 mg', 170, 28000, 1, 1, 4, 
    '["energy", "stress", "nervous"]', 0, '["B1", "B2", "B3", "B5", "B6", "B12", "Folic Acid", "Biotin"]', 
    'B-Complex 100 - Energy & Stress', 'High-potency B-vitamin formula for energy metabolism and stress management', 100, (strftime('%s','now') - (abs(random()) % 2592000))),
    
   (10, 'CoQ10 200mg', 'coq10-200mg', 'Ubiquinol CoQ10 for heart health', 'active', 0, '60 softgels', '200 mg', 130, 85000, 1, 4, 5, 
    '["heart", "energy", "antioxidant"]', 1, '["CoQ10", "Ubiquinol", "Olive Oil"]', 
    'CoQ10 200mg - Cellular Energy', 'Bioavailable CoQ10 for cardiovascular health and cellular energy production', 60, (strftime('%s','now') - (abs(random()) % 2592000))),
    
   (11, 'Vitamin K2 MK-7 100mcg', 'vitamin-k2-mk7-100mcg', 'Vitamin K2 for bone and heart health', 'active', 0, '120 capsules', '100 mcg', 150, 32000, 1, 2, 1, 
    '["bone", "heart", "calcium"]', 0, '["Vitamin K2 MK-7", "MCT Oil"]', 
    'Vitamin K2 MK-7 - Bone & Heart', 'Bioactive vitamin K2 for calcium metabolism and cardiovascular health', 120, (strftime('%s','now') - (abs(random()) % 2592000))),
    
   (12, 'Multivitamin for Men', 'multivitamin-men', 'Complete daily multivitamin for men', 'active', 0, '90 tablets', '1 tablet', 200, 42000, 1, 1, 2, 
    '["daily", "men", "comprehensive"]', 1, '["Vitamin A", "C", "D", "E", "B-Complex", "Minerals"]', 
    'Multivitamin for Men - Daily Wellness', 'Comprehensive multivitamin formula optimized for men''s health needs', 90, (strftime('%s','now') - (abs(random()) % 2592000))),
    
   (13, 'Iron Ferrous Sulfate 65mg', 'iron-ferrous-sulfate-65mg', 'Iron supplement for energy and blood health', 'active', 0, '120 tablets', '65 mg', 180, 15000, 1, 2, 3, 
    '["energy", "blood", "anemia"]', 0, '["Ferrous Sulfate", "Vitamin C"]', 
    'Iron 65mg - Energy & Blood Health', 'Essential iron for red blood cell production and energy metabolism', 120, (strftime('%s','now') - (abs(random()) % 2592000))),
    
   (14, 'Calcium Citrate 600mg', 'calcium-citrate-600mg', 'Highly absorbable calcium with vitamin D', 'active', 0, '180 tablets', '600 mg', 160, 22000, 2, 2, 4, 
    '["bone", "calcium", "teeth"]', 0, '["Calcium Citrate", "Vitamin D3", "Magnesium"]', 
    'Calcium Citrate 600mg - Bone Health', 'Bioavailable calcium with vitamin D for optimal bone density', 180, (strftime('%s','now') - (abs(random()) % 2592000))),
    
   (15, 'Digestive Enzymes', 'digestive-enzymes', 'Multi-enzyme blend for digestion', 'active', 0, '90 capsules', '1 capsule', 140, 38000, 1, 4, 5, 
    '["digestion", "enzymes", "bloating"]', 0, '["Protease", "Amylase", "Lipase", "Lactase", "Cellulase"]', 
    'Digestive Enzymes - Gut Health', 'Broad-spectrum enzyme blend for optimal nutrient absorption and digestive comfort', 90, (strftime('%s','now') - (abs(random()) % 2592000)));

-- Seed Product Images (depends on Products)
INSERT INTO ecom_vit_product_image (product_id, url, is_primary, created_at)
VALUES
  (1, 'https://picsum.photos/600/400?random=p1-1', 1, (strftime('%s','now') - (abs(random()) % 2592000))),
  (1, 'https://picsum.photos/600/400?random=p1-2', 0, (strftime('%s','now') - (abs(random()) % 2592000))),
  (2, 'https://picsum.photos/600/400?random=p2-1', 1, (strftime('%s','now') - (abs(random()) % 2592000))),
  (2, 'https://picsum.photos/600/400?random=p2-2', 0, (strftime('%s','now') - (abs(random()) % 2592000))),
  (3, 'https://picsum.photos/600/400?random=p3-1', 1, (strftime('%s','now') - (abs(random()) % 2592000))),
  (3, 'https://picsum.photos/600/400?random=p3-2', 0, (strftime('%s','now') - (abs(random()) % 2592000))),
  (4, 'https://picsum.photos/600/400?random=p4-1', 1, (strftime('%s','now') - (abs(random()) % 2592000))),
  (4, 'https://picsum.photos/600/400?random=p4-2', 0, (strftime('%s','now') - (abs(random()) % 2592000))),
  (5, 'https://picsum.photos/600/400?random=p5-1', 1, (strftime('%s','now') - (abs(random()) % 2592000))),
  (5, 'https://picsum.photos/600/400?random=p5-2', 0, (strftime('%s','now') - (abs(random()) % 2592000))),
  (6, 'https://picsum.photos/600/400?random=p6-1', 1, (strftime('%s','now') - (abs(random()) % 2592000))),
  (6, 'https://picsum.photos/600/400?random=p6-2', 0, (strftime('%s','now') - (abs(random()) % 2592000))),
  (7, 'https://picsum.photos/600/400?random=p7-1', 1, (strftime('%s','now') - (abs(random()) % 2592000))),
  (7, 'https://picsum.photos/600/400?random=p7-2', 0, (strftime('%s','now') - (abs(random()) % 2592000))),
  (8, 'https://picsum.photos/600/400?random=p8-1', 1, (strftime('%s','now') - (abs(random()) % 2592000))),
  (8, 'https://picsum.photos/600/400?random=p8-2', 0, (strftime('%s','now') - (abs(random()) % 2592000))),
  (9, 'https://picsum.photos/600/400?random=p9-1', 1, (strftime('%s','now') - (abs(random()) % 2592000))),
  (9, 'https://picsum.photos/600/400?random=p9-2', 0, (strftime('%s','now') - (abs(random()) % 2592000))),
  (10, 'https://picsum.photos/600/400?random=p10-1', 1, (strftime('%s','now') - (abs(random()) % 2592000))),
  (10, 'https://picsum.photos/600/400?random=p10-2', 0, (strftime('%s','now') - (abs(random()) % 2592000))),
  (11, 'https://picsum.photos/600/400?random=p11-1', 1, (strftime('%s','now') - (abs(random()) % 2592000))),
  (11, 'https://picsum.photos/600/400?random=p11-2', 0, (strftime('%s','now') - (abs(random()) % 2592000))),
  (12, 'https://picsum.photos/600/400?random=p12-1', 1, (strftime('%s','now') - (abs(random()) % 2592000))),
  (12, 'https://picsum.photos/600/400?random=p12-2', 0, (strftime('%s','now') - (abs(random()) % 2592000))),
  (13, 'https://picsum.photos/600/400?random=p13-1', 1, (strftime('%s','now') - (abs(random()) % 2592000))),
  (13, 'https://picsum.photos/600/400?random=p13-2', 0, (strftime('%s','now') - (abs(random()) % 2592000))),
  (14, 'https://picsum.photos/600/400?random=p14-1', 1, (strftime('%s','now') - (abs(random()) % 2592000))),
  (14, 'https://picsum.photos/600/400?random=p14-2', 0, (strftime('%s','now') - (abs(random()) % 2592000))),
  (15, 'https://picsum.photos/600/400?random=p15-1', 1, (strftime('%s','now') - (abs(random()) % 2592000))),
  (15, 'https://picsum.photos/600/400?random=p15-2', 0, (strftime('%s','now') - (abs(random()) % 2592000)));

-- Seed Customers (independent table)
INSERT INTO ecom_vit_customer (phone, address, created_at)
VALUES
  (60000001, '123 Main St, Springfield, 10001', (strftime('%s','now') - (abs(random()) % 2592000))),
  (60000002, '456 Oak Ave, Springfield, 10002', (strftime('%s','now') - (abs(random()) % 2592000))),
  (60000003, '789 Pine Rd, Springfield, 10003', (strftime('%s','now') - (abs(random()) % 2592000))),
  (60000004, '12 Maple St, Shelbyville, 20001', (strftime('%s','now') - (abs(random()) % 2592000))),
  (60000005, '34 Elm Ave, Shelbyville, 20002', (strftime('%s','now') - (abs(random()) % 2592000))),
  (60000006, '56 Cedar Rd, Shelbyville, 20003', (strftime('%s','now') - (abs(random()) % 2592000))),
  (60000007, '78 Birch St, Ogdenville, 30001', (strftime('%s','now') - (abs(random()) % 2592000))),
  (60000008, '90 Walnut Ave, Ogdenville, 30002', (strftime('%s','now') - (abs(random()) % 2592000))),
  (60000009, '135 Cherry Rd, Ogdenville, 30003', (strftime('%s','now') - (abs(random()) % 2592000))),
  (60000010, '246 Peach St, North Haverbrook, 40001', (strftime('%s','now') - (abs(random()) % 2592000))),
  (60000011, '357 Plum Ave, North Haverbrook, 40002', (strftime('%s','now') - (abs(random()) % 2592000))),
  (60000012, '468 Apple Rd, North Haverbrook, 40003', (strftime('%s','now') - (abs(random()) % 2592000))),
  (60000013, '579 Grape St, Capital City, 50001', (strftime('%s','now') - (abs(random()) % 2592000))),
  (60000014, '680 Lemon Ave, Capital City, 50002', (strftime('%s','now') - (abs(random()) % 2592000))),
  (60000015, '791 Lime Rd, Capital City, 50003', (strftime('%s','now') - (abs(random()) % 2592000)));

-- Seed Purchases (depends on Products)
INSERT INTO ecom_vit_purchase (product_id, quantity_purchased, unit_cost, created_at)
VALUES
  (1, 200, 17500, (strftime('%s','now') - (abs(random()) % 2592000))),
  (2, 150, 21000, (strftime('%s','now') - (abs(random()) % 2592000))),
  (3, 180, 38500, (strftime('%s','now') - (abs(random()) % 2592000))),
  (4, 120, 63000, (strftime('%s','now') - (abs(random()) % 2592000))),
  (5, 220, 45500, (strftime('%s','now') - (abs(random()) % 2592000))),
  (6, 160, 12000, (strftime('%s','now') - (abs(random()) % 2592000))),
  (7, 140, 32000, (strftime('%s','now') - (abs(random()) % 2592000))),
  (8, 190, 25000, (strftime('%s','now') - (abs(random()) % 2592000))),
  (9, 170, 20000, (strftime('%s','now') - (abs(random()) % 2592000))),
  (10, 130, 60000, (strftime('%s','now') - (abs(random()) % 2592000))),
  (11, 150, 22000, (strftime('%s','now') - (abs(random()) % 2592000))),
  (12, 200, 30000, (strftime('%s','now') - (abs(random()) % 2592000))),
  (13, 180, 10000, (strftime('%s','now') - (abs(random()) % 2592000))),
  (14, 160, 15000, (strftime('%s','now') - (abs(random()) % 2592000))),
  (15, 140, 26000, (strftime('%s','now') - (abs(random()) % 2592000)));

-- Update stock based on purchases
UPDATE ecom_vit_product SET stock = stock + 200 WHERE id = 1;
UPDATE ecom_vit_product SET stock = stock + 150 WHERE id = 2;
UPDATE ecom_vit_product SET stock = stock + 180 WHERE id = 3;
UPDATE ecom_vit_product SET stock = stock + 120 WHERE id = 4;
UPDATE ecom_vit_product SET stock = stock + 220 WHERE id = 5;
UPDATE ecom_vit_product SET stock = stock + 160 WHERE id = 6;
UPDATE ecom_vit_product SET stock = stock + 140 WHERE id = 7;
UPDATE ecom_vit_product SET stock = stock + 190 WHERE id = 8;
UPDATE ecom_vit_product SET stock = stock + 170 WHERE id = 9;
UPDATE ecom_vit_product SET stock = stock + 130 WHERE id = 10;
UPDATE ecom_vit_product SET stock = stock + 150 WHERE id = 11;
UPDATE ecom_vit_product SET stock = stock + 200 WHERE id = 12;
UPDATE ecom_vit_product SET stock = stock + 180 WHERE id = 13;
UPDATE ecom_vit_product SET stock = stock + 160 WHERE id = 14;
UPDATE ecom_vit_product SET stock = stock + 140 WHERE id = 15;

-- -- Seed Carts (depends on Customers)
-- INSERT INTO ecom_vit_cart (customer_id, created_at)
-- VALUES
--   (60000001, (strftime('%s','now') - (abs(random()) % 2592000))),
--   (60000002, (strftime('%s','now') - (abs(random()) % 2592000))),
--   (60000003, (strftime('%s','now') - (abs(random()) % 2592000)));

-- Seed Orders (depends on Customers)
INSERT INTO ecom_vit_order (id, order_number, customer_phone, status, address, delivery_provider, total, notes, created_at)
VALUES
  (1, 'A1B2C3D4', 60000001, 'delivered', '123 Main St, Springfield, 10001', 'tu-delivery', 80000, NULL, (strftime('%s','now') - (abs(random()) % 2592000))),
  (2, 'E5F6G7H8', 60000002, 'pending', '456 Oak Ave, Springfield, 10002', 'self', 155000, 'Leave at door', (strftime('%s','now') - (abs(random()) % 2592000))),
  (3, 'J1K2L3M4', 60000003, 'shipped', '789 Pine Rd, Springfield, 10003', 'avidaa', 95000, NULL, (strftime('%s','now') - (abs(random()) % 2592000))),
  (4, 'N5P6Q7R8', 60000004, 'delivered', '12 Maple St, Shelbyville, 20001', 'tu-delivery', 145000, 'Ring bell', (strftime('%s','now') - (abs(random()) % 2592000))),
  (5, 'S1T2U3V4', 60000005, 'cancelled', '34 Elm Ave, Shelbyville, 20002', 'self', 67000, 'Customer called', (strftime('%s','now') - (abs(random()) % 2592000))),
  (6, 'W5X6Y7Z8', 60000006, 'delivered', '56 Cedar Rd, Shelbyville, 20003', 'tu-delivery', 112000, NULL, (strftime('%s','now') - (abs(random()) % 2592000))),
  (7, 'A9B8C7D6', 60000007, 'processing', '78 Birch St, Ogdenville, 30001', 'avidaa', 178000, 'Handle with care', (strftime('%s','now') - (abs(random()) % 2592000))),
  (8, 'E1F2G3H4', 60000008, 'shipped', '90 Walnut Ave, Ogdenville, 30002', 'self', 93000, NULL, (strftime('%s','now') - (abs(random()) % 2592000))),
  (9, 'I5J6K7L8', 60000009, 'delivered', '135 Cherry Rd, Ogdenville, 30003', 'tu-delivery', 234000, 'Customer prefers evening delivery', (strftime('%s','now') - (abs(random()) % 2592000))),
  (10, 'M9N8O7P6', 60000010, 'pending', '246 Peach St, North Haverbrook, 40001', 'self', 156000, NULL, (strftime('%s','now') - (abs(random()) % 2592000)));

-- -- Seed Cart Items (depends on Carts, Products)
-- INSERT INTO ecom_vit_cart_item (cart_id, product_id, quantity, created_at)
-- VALUES
--   (1, 1, 2, (strftime('%s','now') - (abs(random()) % 2592000))),
--   (1, 2, 1, (strftime('%s','now') - (abs(random()) % 2592000))),
--   (2, 3, 1, (strftime('%s','now') - (abs(random()) % 2592000))),
--   (3, 4, 1, (strftime('%s','now') - (abs(random()) % 2592000)));

-- Seed Order Details (depends on Orders, Products)
INSERT INTO ecom_vit_order_detail (order_id, product_id, quantity, created_at)
VALUES
  (1, 1, 2, (strftime('%s','now') - (abs(random()) % 2592000))),
  (1, 2, 1, (strftime('%s','now') - (abs(random()) % 2592000))),
  (2, 3, 1, (strftime('%s','now') - (abs(random()) % 2592000))),
  (2, 4, 1, (strftime('%s','now') - (abs(random()) % 2592000))),
  (3, 5, 1, (strftime('%s','now') - (abs(random()) % 2592000))),
  (4, 4, 1, (strftime('%s','now') - (abs(random()) % 2592000))),
  (4, 3, 1, (strftime('%s','now') - (abs(random()) % 2592000))),
  (5, 2, 1, (strftime('%s','now') - (abs(random()) % 2592000))),
  (5, 1, 1, (strftime('%s','now') - (abs(random()) % 2592000))),
  (6, 6, 2, (strftime('%s','now') - (abs(random()) % 2592000))),
  (6, 7, 1, (strftime('%s','now') - (abs(random()) % 2592000))),
  (7, 8, 1, (strftime('%s','now') - (abs(random()) % 2592000))),
  (7, 9, 2, (strftime('%s','now') - (abs(random()) % 2592000))),
  (7, 10, 1, (strftime('%s','now') - (abs(random()) % 2592000))),
  (8, 11, 1, (strftime('%s','now') - (abs(random()) % 2592000))),
  (8, 12, 1, (strftime('%s','now') - (abs(random()) % 2592000))),
  (9, 13, 2, (strftime('%s','now') - (abs(random()) % 2592000))),
  (9, 14, 1, (strftime('%s','now') - (abs(random()) % 2592000))),
  (9, 15, 1, (strftime('%s','now') - (abs(random()) % 2592000))),
  (10, 1, 1, (strftime('%s','now') - (abs(random()) % 2592000))),
  (10, 5, 1, (strftime('%s','now') - (abs(random()) % 2592000))),
  (10, 8, 1, (strftime('%s','now') - (abs(random()) % 2592000)));

-- Seed Payments (depends on Orders)
INSERT INTO ecom_vit_payment (order_id, provider, status, created_at)
VALUES
  (1, 'transfer', 'success', (strftime('%s','now') - (abs(random()) % 2592000))),
  (2, 'qpay', 'pending', (strftime('%s','now') - (abs(random()) % 2592000))),
  (3, 'cash', 'success', (strftime('%s','now') - (abs(random()) % 2592000))),
  (4, 'transfer', 'success', (strftime('%s','now') - (abs(random()) % 2592000))),
  (5, 'cash', 'failed', (strftime('%s','now') - (abs(random()) % 2592000))),
  (6, 'qpay', 'success', (strftime('%s','now') - (abs(random()) % 2592000))),
  (7, 'transfer', 'pending', (strftime('%s','now') - (abs(random()) % 2592000))),
  (8, 'cash', 'success', (strftime('%s','now') - (abs(random()) % 2592000))),
  (9, 'qpay', 'success', (strftime('%s','now') - (abs(random()) % 2592000))),
  (10, 'transfer', 'pending', (strftime('%s','now') - (abs(random()) % 2592000)));

-- Seed Sales (depends on Products, Orders) - Only for successful payments
INSERT INTO ecom_vit_sales (product_id, order_id, quantity_sold, product_cost, selling_price, discount_applied, created_at)
VALUES
  (1, 1, 2, 17500, 25000, 0, (SELECT created_at FROM ecom_vit_order WHERE id=1)),
  (2, 1, 1, 21000, 30000, 0, (SELECT created_at FROM ecom_vit_order WHERE id=1)),
  (5, 3, 1, 45500, 65000, 0, (SELECT created_at FROM ecom_vit_order WHERE id=3)),
  (4, 4, 1, 63000, 90000, 0, (SELECT created_at FROM ecom_vit_order WHERE id=4)),
  (3, 4, 1, 38500, 55000, 0, (SELECT created_at FROM ecom_vit_order WHERE id=4)),
  (6, 6, 2, 12000, 18000, 0, (SELECT created_at FROM ecom_vit_order WHERE id=6)),
  (7, 6, 1, 32000, 45000, 0, (SELECT created_at FROM ecom_vit_order WHERE id=6)),
  (11, 8, 1, 22000, 32000, 0, (SELECT created_at FROM ecom_vit_order WHERE id=8)),
  (12, 8, 1, 30000, 42000, 0, (SELECT created_at FROM ecom_vit_order WHERE id=8)),
  (13, 9, 2, 10000, 15000, 0, (SELECT created_at FROM ecom_vit_order WHERE id=9)),
  (14, 9, 1, 15000, 22000, 0, (SELECT created_at FROM ecom_vit_order WHERE id=9)),
  (15, 9, 1, 26000, 38000, 0, (SELECT created_at FROM ecom_vit_order WHERE id=9));

-- Update product stock based on sales
UPDATE ecom_vit_product SET stock = stock - 2 WHERE id = 1;
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 2;
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 5;
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 4;
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 3;
UPDATE ecom_vit_product SET stock = stock - 2 WHERE id = 6;
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 7;
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 11;
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 12;
UPDATE ecom_vit_product SET stock = stock - 2 WHERE id = 13;
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 14;
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 15;
