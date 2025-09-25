PRAGMA foreign_keys = OFF;
BEGIN TRANSACTION;

-- Purge existing data in FK-safe order
DELETE FROM ecom_vit_order_detail;
DELETE FROM ecom_vit_payment;
DELETE FROM ecom_vit_sales;
DELETE FROM ecom_vit_purchase;
DELETE FROM ecom_vit_product_image;
DELETE FROM ecom_vit_cart_item;
DELETE FROM ecom_vit_order;
DELETE FROM ecom_vit_cart;
DELETE FROM ecom_vit_product;
DELETE FROM ecom_vit_category;
DELETE FROM ecom_vit_brand;
DELETE FROM ecom_vit_customer;
DELETE FROM ecom_vit_user;

-- Reset AUTOINCREMENT counters if present (SQLite only)
DELETE FROM sqlite_sequence;

-- Seed Brands
INSERT INTO ecom_vit_brand (id, name, logo_url)
VALUES
  (1, 'NOW Foods', 'https://picsum.photos/600/400?random=26'),
  (2, 'Nature''s Best', 'https://picsum.photos/600/400?random=27'),
  (3, 'Microingredients', 'https://picsum.photos/600/400?random=28'),
  (4, 'NutraCost', 'https://picsum.photos/600/400?random=29'),
  (5, 'Doctor''s Best', 'https://picsum.photos/600/400?random=30');

-- Seed Categories
INSERT INTO ecom_vit_category (id, name)
VALUES
  (1, 'Vitamins'),
  (2, 'Minerals'),
  (3, 'Herbal Supplements'),
  (4, 'Probiotics'),
  (5, 'Energy Supplements');

-- Seed Products
INSERT INTO ecom_vit_product (
  id, name, slug, description, status, discount, amount, potency, stock, price, daily_intake, category_id, brand_id
) VALUES
  (1,  'Vitamin C 500mg',                  'vitamin-c-500mg',                 'High potency Vitamin C',               'active', 0, '100 tablets',  '500 mg',  0,  25000, 2, 1, 1),
  (2,  'Vitamin D3 2000 IU',               'vitamin-d3-2000-iu',              'Vitamin D3 support',                   'active', 0, '120 softgels','2000 IU', 0,  30000, 1, 1, 2),
  (3,  'Magnesium Glycinate 120 Tablets',  'magnesium-glycinate-120-tablets', 'Magnesium for relaxation',             'active', 0, '120 tablets', '200 mg',  0,  55000, 2, 2, 3),
  (4,  'Probiotic Complex 30 Billion',     'probiotic-complex-30-billion',    '30B CFU probiotic',                    'active', 0, '60 capsules', '—',       0,  90000, 1, 4, 4),
  (5,  'Ashwagandha 1000mg',               'ashwagandha-1000mg',              'Stress support Ashwagandha',           'active', 0, '120 capsules','1000 mg', 0,  65000, 2, 3, 5),
  (6,  'Omega-3 Fish Oil 1000mg',          'omega-3-fish-oil-1000mg',         'Supports heart health',                'active', 0, '200 softgels','1000 mg', 0,  75000, 2, 5, 1),
  (7,  'Zinc Picolinate 50mg',             'zinc-picolinate-50mg',            'Zinc immune support',                  'active', 0, '100 capsules','50 mg',   0,  22000, 1, 2, 2),
  (8,  'Calcium Citrate 500mg',            'calcium-citrate-500mg',           'Bone support Calcium',                 'active', 0, '180 tablets', '500 mg',  0,  45000, 2, 2, 3),
  (9,  'Turmeric Curcumin 1500mg',         'turmeric-curcumin-1500mg',        'Joint support turmeric',               'active', 0, '120 capsules','1500 mg', 0,  80000, 2, 3, 4),
  (10, 'CoQ10 200mg',                      'coq10-200mg',                     'Coenzyme Q10',                         'active', 0, '120 softgels','200 mg',  0, 120000, 1, 5, 5),
  (11, 'B-Complex',                        'b-complex',                        'B vitamins complex',                   'active', 0, '100 tablets', '—',       0,  35000, 1, 1, 1),
  (12, 'Iron Bisglycinate 25mg',           'iron-bisglycinate-25mg',          'Gentle iron supplement',               'active', 0, '90 capsules', '25 mg',   0,  28000, 1, 2, 2),
  (13, 'Collagen Peptides 500g',           'collagen-peptides-500g',          'Hydrolyzed collagen powder',           'active', 0, '500 g',       '500 g',   0,  95000, 1, 3, 3),
  (14, 'Elderberry Gummies 60ct',          'elderberry-gummies-60ct',         'Immune support gummies',               'active', 0, '60 gummies',  '—',       0,  40000, 1, 3, 4),
  (15, 'Melatonin 5mg',                    'melatonin-5mg',                    'Sleep support melatonin',              'active', 0, '240 tablets', '5 mg',    0,  18000, 1, 1, 5),
  (16, 'Probiotic Chewables Kids',         'probiotic-chewables-kids',        'Kids probiotic chewables',             'active', 0, '60 chewables','—',       0,  60000, 1, 4, 1),
  (17, 'Vitamin B12 1000mcg',              'vitamin-b12-1000mcg',             'Energy support B12',                   'active', 0, '200 tablets', '1000 mcg',0,  27000, 1, 1, 2),
  (18, 'L-Theanine 200mg',                 'l-theanine-200mg',                'Calm focus L-Theanine',                'active', 0, '120 capsules','200 mg',  0,  32000, 1, 5, 3),
  (19, 'Creatine Monohydrate 300g',        'creatine-monohydrate-300g',       'Performance creatine',                 'active', 0, '300 g',       '300 g',   0,  70000, 1, 5, 4),
  (20, 'Electrolyte Powder 250g',          'electrolyte-powder-250g',         'Hydration electrolyte mix',            'active', 0, '250 g',       '250 g',   0,  50000, 1, 5, 5),
  (21, 'Multivitamin Men''s',              'multivitamin-mens',               'Men''s daily multivitamin',            'active', 0, '180 tablets', '—',       0,  60000, 1, 1, 1),
  (22, 'Multivitamin Women''s',            'multivitamin-womens',             'Women''s daily multivitamin',          'active', 0, '180 tablets', '—',       0,  60000, 1, 1, 2),
  (23, 'Green Superfood Blend 300g',       'green-superfood-blend-300g',      'Greens powder blend',                  'active', 0, '300 g',       '300 g',   0,  65000, 1, 3, 3),
  (24, 'Milk Thistle 250mg',               'milk-thistle-250mg',              'Liver support milk thistle',           'active', 0, '120 capsules','250 mg',  0,  38000, 1, 3, 4),
  (25, 'Glucosamine Chondroitin MSM',      'glucosamine-chondroitin-msm',     'Joint support formula',                'active', 0, '180 tablets', '—',       0,  85000, 1, 3, 5);

-- Seed Product Images (1-3 per product, first isPrimary=1)
INSERT INTO ecom_vit_product_image (product_id, url, is_primary)
VALUES
  (1, 'https://picsum.photos/600/400?random=p1-1', 1),
  (1, 'https://picsum.photos/600/400?random=p1-2', 0),
  (2, 'https://picsum.photos/600/400?random=p2-1', 1),
  (2, 'https://picsum.photos/600/400?random=p2-2', 0),
  (3, 'https://picsum.photos/600/400?random=p3-1', 1),
  (3, 'https://picsum.photos/600/400?random=p3-2', 0),
  (4, 'https://picsum.photos/600/400?random=p4-1', 1),
  (4, 'https://picsum.photos/600/400?random=p4-2', 0),
  (5, 'https://picsum.photos/600/400?random=p5-1', 1),
  (5, 'https://picsum.photos/600/400?random=p5-2', 0),
  (6, 'https://picsum.photos/600/400?random=p6-1', 1),
  (6, 'https://picsum.photos/600/400?random=p6-2', 0),
  (7, 'https://picsum.photos/600/400?random=p7-1', 1),
  (7, 'https://picsum.photos/600/400?random=p7-2', 0),
  (8, 'https://picsum.photos/600/400?random=p8-1', 1),
  (8, 'https://picsum.photos/600/400?random=p8-2', 0),
  (9, 'https://picsum.photos/600/400?random=p9-1', 1),
  (9, 'https://picsum.photos/600/400?random=p9-2', 0),
  (10,'https://picsum.photos/600/400?random=p10-1',1),
  (10,'https://picsum.photos/600/400?random=p10-2',0),
  (11,'https://picsum.photos/600/400?random=p11-1',1),
  (12,'https://picsum.photos/600/400?random=p12-1',1),
  (13,'https://picsum.photos/600/400?random=p13-1',1),
  (13,'https://picsum.photos/600/400?random=p13-2',0),
  (14,'https://picsum.photos/600/400?random=p14-1',1),
  (14,'https://picsum.photos/600/400?random=p14-2',0),
  (15,'https://picsum.photos/600/400?random=p15-1',1),
  (16,'https://picsum.photos/600/400?random=p16-1',1),
  (17,'https://picsum.photos/600/400?random=p17-1',1),
  (18,'https://picsum.photos/600/400?random=p18-1',1),
  (18,'https://picsum.photos/600/400?random=p18-2',0),
  (19,'https://picsum.photos/600/400?random=p19-1',1),
  (19,'https://picsum.photos/600/400?random=p19-2',0),
  (20,'https://picsum.photos/600/400?random=p20-1',1),
  (21,'https://picsum.photos/600/400?random=p21-1',1),
  (22,'https://picsum.photos/600/400?random=p22-1',1),
  (23,'https://picsum.photos/600/400?random=p23-1',1),
  (24,'https://picsum.photos/600/400?random=p24-1',1),
  (24,'https://picsum.photos/600/400?random=p24-2',0),
  (25,'https://picsum.photos/600/400?random=p25-1',1);

-- Seed Customers
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
  (60000015, '791 Lime Rd, Capital City, 50003', (strftime('%s','now') - (abs(random()) % 2592000))),
  (60000016, '802 Mango St, Cypress Creek, 60001', (strftime('%s','now') - (abs(random()) % 2592000))),
  (60000017, '913 Papaya Ave, Cypress Creek, 60002', (strftime('%s','now') - (abs(random()) % 2592000))),
  (60000018, '1024 Banana Rd, Cypress Creek, 60003', (strftime('%s','now') - (abs(random()) % 2592000))),
  (60000019, '1135 Kiwi St, Ogdenville, 30004', (strftime('%s','now') - (abs(random()) % 2592000))),
  (60000020, '1246 Pear Ave, Ogdenville, 30005', (strftime('%s','now') - (abs(random()) % 2592000))),
  (60000021, '1357 Fig Rd, Springfield, 10004', (strftime('%s','now') - (abs(random()) % 2592000))),
  (60000022, '1468 Date St, Springfield, 10005', (strftime('%s','now') - (abs(random()) % 2592000))),
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
  (60000015, '791 Lime Rd, Capital City, 50003', (strftime('%s','now') - (abs(random()) % 2592000))),
  (60000016, '802 Mango St, Cypress Creek, 60001', (strftime('%s','now') - (abs(random()) % 2592000))),
  (60000017, '913 Papaya Ave, Cypress Creek, 60002', (strftime('%s','now') - (abs(random()) % 2592000))),
  (60000018, '1024 Banana Rd, Cypress Creek, 60003', (strftime('%s','now') - (abs(random()) % 2592000))),
  (60000019, '1135 Kiwi St, Ogdenville, 30004', (strftime('%s','now') - (abs(random()) % 2592000))),
  (60000020, '1246 Pear Ave, Ogdenville, 30005', (strftime('%s','now') - (abs(random()) % 2592000))),
  (60000021, '1357 Fig Rd, Springfield, 10004', (strftime('%s','now') - (abs(random()) % 2592000))),
  (60000022, '1468 Date St, Springfield, 10005', (strftime('%s','now') - (abs(random()) % 2592000))),
  (60000023, '1579 Apricot Ave, Shelbyville, 20004', (strftime('%s','now') - (abs(random()) % 2592000))),
  (60000024, '1680 Guava Rd, Shelbyville, 20005', (strftime('%s','now') - (abs(random()) % 2592000))),
  (60000025, '1791 Coconut St, North Haverbrook, 40004', (strftime('%s','now') - (abs(random()) % 2592000))),
  (60000026, '1802 Avocado Ave, North Haverbrook, 40005', (strftime('%s','now') - (abs(random()) % 2592000))),
  (60000027, '1913 Cherry Blossom Rd, Capital City, 50004', (strftime('%s','now') - (abs(random()) % 2592000))),
  (60000028, '2024 Willow St, Capital City, 50005', (strftime('%s','now') - (abs(random()) % 2592000))),
  (60000029, '2135 Poplar Ave, Cypress Creek, 60004', (strftime('%s','now') - (abs(random()) % 2592000))),
  (60000030, '2246 Sycamore Rd, Cypress Creek, 60005', (strftime('%s','now') - (abs(random()) % 2592000)));
 (60000023, '1579 Apricot Ave, Shelbyville, 20004', (strftime('%s','now') - (abs(random()) % 2592000))),
  (60000024, '1680 Guava Rd, Shelbyville, 20005', (strftime('%s','now') - (abs(random()) % 2592000))),
  (60000025, '1791 Coconut St, North Haverbrook, 40004', (strftime('%s','now') - (abs(random()) % 2592000))),
  (60000026, '1802 Avocado Ave, North Haverbrook, 40005', (strftime('%s','now') - (abs(random()) % 2592000))),
  (60000027, '1913 Cherry Blossom Rd, Capital City, 50004', (strftime('%s','now') - (abs(random()) % 2592000))),
  (60000028, '2024 Willow St, Capital City, 50005', (strftime('%s','now') - (abs(random()) % 2592000))),
  (60000029, '2135 Poplar Ave, Cypress Creek, 60004', (strftime('%s','now') - (abs(random()) % 2592000))),
  (60000030, '2246 Sycamore Rd, Cypress Creek, 60005', (strftime('%s','now') - (abs(random()) % 2592000)));

-- Seed Purchases (one per product) and update stock accordingly
INSERT INTO ecom_vit_purchase (product_id, quantity_purchased, unit_cost, created_at)
VALUES
  (1,  200, 17500, (strftime('%s','now') - (abs(random()) % 2592000))),
  (2,  150, 21000, (strftime('%s','now') - (abs(random()) % 2592000))),
  (3,  180, 38500, (strftime('%s','now') - (abs(random()) % 2592000))),
  (4,  120, 63000, (strftime('%s','now') - (abs(random()) % 2592000))),
  (5,  220, 45500, (strftime('%s','now') - (abs(random()) % 2592000))),
  (6,  250, 52500, (strftime('%s','now') - (abs(random()) % 2592000))),
  (7,  160, 15400, (strftime('%s','now') - (abs(random()) % 2592000))),
  (8,  190, 31500, (strftime('%s','now') - (abs(random()) % 2592000))),
  (9,  140, 56000, (strftime('%s','now') - (abs(random()) % 2592000))),
  (10, 130, 84000, (strftime('%s','now') - (abs(random()) % 2592000))),
  (11, 210, 24500, (strftime('%s','now') - (abs(random()) % 2592000))),
  (12, 170, 19600, (strftime('%s','now') - (abs(random()) % 2592000))),
  (13, 110, 66500, (strftime('%s','now') - (abs(random()) % 2592000))),
  (14, 160, 28000, (strftime('%s','now') - (abs(random()) % 2592000))),
  (15, 240, 12600, (strftime('%s','now') - (abs(random()) % 2592000))),
  (16, 150, 42000, (strftime('%s','now') - (abs(random()) % 2592000))),
  (17, 200, 18900, (strftime('%s','now') - (abs(random()) % 2592000))),
  (18, 180, 22400, (strftime('%s','now') - (abs(random()) % 2592000))),
  (19, 220, 49000, (strftime('%s','now') - (abs(random()) % 2592000))),
  (20, 200, 35000, (strftime('%s','now') - (abs(random()) % 2592000))),
  (21, 210, 42000, (strftime('%s','now') - (abs(random()) % 2592000))),
  (22, 210, 42000, (strftime('%s','now') - (abs(random()) % 2592000))),
  (23, 140, 45500, (strftime('%s','now') - (abs(random()) % 2592000))),
  (24, 180, 26600, (strftime('%s','now') - (abs(random()) % 2592000))),
  (25, 160, 59500, (strftime('%s','now') - (abs(random()) % 2592000)));

-- Apply stock updates from purchases
UPDATE ecom_vit_product SET stock = stock + 200 WHERE id = 1;
UPDATE ecom_vit_product SET stock = stock + 150 WHERE id = 2;
UPDATE ecom_vit_product SET stock = stock + 180 WHERE id = 3;
UPDATE ecom_vit_product SET stock = stock + 120 WHERE id = 4;
UPDATE ecom_vit_product SET stock = stock + 220 WHERE id = 5;
UPDATE ecom_vit_product SET stock = stock + 250 WHERE id = 6;
UPDATE ecom_vit_product SET stock = stock + 160 WHERE id = 7;
UPDATE ecom_vit_product SET stock = stock + 190 WHERE id = 8;
UPDATE ecom_vit_product SET stock = stock + 140 WHERE id = 9;
UPDATE ecom_vit_product SET stock = stock + 130 WHERE id = 10;
UPDATE ecom_vit_product SET stock = stock + 210 WHERE id = 11;
UPDATE ecom_vit_product SET stock = stock + 170 WHERE id = 12;
UPDATE ecom_vit_product SET stock = stock + 110 WHERE id = 13;
UPDATE ecom_vit_product SET stock = stock + 160 WHERE id = 14;
UPDATE ecom_vit_product SET stock = stock + 240 WHERE id = 15;
UPDATE ecom_vit_product SET stock = stock + 150 WHERE id = 16;
UPDATE ecom_vit_product SET stock = stock + 200 WHERE id = 17;
UPDATE ecom_vit_product SET stock = stock + 180 WHERE id = 18;
UPDATE ecom_vit_product SET stock = stock + 220 WHERE id = 19;
UPDATE ecom_vit_product SET stock = stock + 200 WHERE id = 20;
UPDATE ecom_vit_product SET stock = stock + 210 WHERE id = 21;
UPDATE ecom_vit_product SET stock = stock + 210 WHERE id = 22;
UPDATE ecom_vit_product SET stock = stock + 140 WHERE id = 23;
UPDATE ecom_vit_product SET stock = stock + 180 WHERE id = 24;
UPDATE ecom_vit_product SET stock = stock + 160 WHERE id = 25;

-- Seed Orders (35 orders)
-- Note: order_number is 8 chars A-Z0-9 as per schema length
INSERT INTO ecom_vit_order (id, order_number, customer_phone, status, address, delivery_provider, total, notes, created_at)
VALUES
  (1,  'A1B2C3D4', 60000001, 'delivered', '123 Main St, Springfield, 10001', 'tu-delivery',  80000,  NULL, (strftime('%s','now') - (abs(random()) % 2592000))),
  (2,  'E5F6G7H8', 60000002, 'pending',   '456 Oak Ave, Springfield, 10002', 'self',         150000, 'Leave at door', (strftime('%s','now') - (abs(random()) % 2592000))),
  (3,  'J1K2L3M4', 60000003, 'shipped',   '789 Pine Rd, Springfield, 10003', 'avidaa',        95000,  NULL, (strftime('%s','now') - (abs(random()) % 2592000))),
  (4,  'N5P6Q7R8', 60000004, 'delivered', '12 Maple St, Shelbyville, 20001', 'tu-delivery', 140000,  'Ring bell', (strftime('%s','now') - (abs(random()) % 2592000))),
  (5,  'S1T2U3V4', 60000005, 'cancelled', '34 Elm Ave, Shelbyville, 20002', 'self',          47000,  'Customer called', (strftime('%s','now') - (abs(random()) % 2592000))),
  (6,  'W5X6Y7Z8', 60000006, 'delivered', '56 Cedar Rd, Shelbyville, 20003', 'avidaa',      200000,  NULL, (strftime('%s','now') - (abs(random()) % 2592000))),
  (7,  'A8B7C6D5', 60000007, 'pending',   '78 Birch St, Ogdenville, 30001', 'tu-delivery',   57000,  NULL, (strftime('%s','now') - (abs(random()) % 2592000))),
  (8,  'E4F3G2H1', 60000008, 'delivered', '90 Walnut Ave, Ogdenville, 30002','self',        175000,  'Fragile', (strftime('%s','now') - (abs(random()) % 2592000))),
  (9,  'J8K7L6M5', 60000009, 'refunded',  '135 Cherry Rd, Ogdenville, 30003','avidaa',       60000,  'Refund processed', (strftime('%s','now') - (abs(random()) % 2592000))),
  (10, 'N4P3Q2R1', 60000010, 'delivered', '246 Peach St, North Haverbrook, 40001','tu-delivery', 220000, NULL, (strftime('%s','now') - (abs(random()) % 2592000))),
  (11, 'S8T7U6V5', 60000011, 'shipped',   '357 Plum Ave, North Haverbrook, 40002','self',    125000, NULL, (strftime('%s','now') - (abs(random()) % 2592000))),
  (12, 'W4X3Y2Z1', 60000012, 'pending',   '468 Apple Rd, North Haverbrook, 40003','avidaa',  35000,  NULL, (strftime('%s','now') - (abs(random()) % 2592000))),
  (13, 'A9B8C7D6', 60000013, 'delivered', '579 Grape St, Capital City, 50001','tu-delivery',  95000,  'Gift wrap', (strftime('%s','now') - (abs(random()) % 2592000))),
  (14, 'E3F2G1H9', 60000014, 'delivered', '680 Lemon Ave, Capital City, 50002','self',        88000,  NULL, (strftime('%s','now') - (abs(random()) % 2592000))),
  (15, 'J7K6L5M4', 60000015, 'cancelled', '791 Lime Rd, Capital City, 50003','avidaa',       53000,  'Out of stock', (strftime('%s','now') - (abs(random()) % 2592000))),
  (16, 'N3P2Q1R9', 60000016, 'delivered', '802 Mango St, Cypress Creek, 60001','tu-delivery', 62000,  NULL, (strftime('%s','now') - (abs(random()) % 2592000))),
  (17, 'S7T6U5V4', 60000017, 'shipped',   '913 Papaya Ave, Cypress Creek, 60002','self',     100000, 'Evening', (strftime('%s','now') - (abs(random()) % 2592000))),
  (18, 'W3X2Y1Z9', 60000018, 'delivered', '1024 Banana Rd, Cypress Creek, 60003','avidaa',   127000,  NULL, (strftime('%s','now') - (abs(random()) % 2592000))),
  (19, 'A0B1C2D3', 60000019, 'refunded',  '1135 Kiwi St, Ogdenville, 30004','tu-delivery',    95000,  'Refunded', (strftime('%s','now') - (abs(random()) % 2592000))),
  (20, 'E0F1G2H3', 60000020, 'delivered', '1246 Pear Ave, Ogdenville, 30005','self',        130000,  NULL, (strftime('%s','now') - (abs(random()) % 2592000))),
  (21, 'J0K1L2M3', 60000021, 'pending',   '1357 Fig Rd, Springfield, 10004','avidaa',        120000,  NULL, (strftime('%s','now') - (abs(random()) % 2592000))),
  (22, 'N0P1Q2R3', 60000022, 'delivered', '1468 Date St, Springfield, 10005','tu-delivery',   87000,  NULL, (strftime('%s','now') - (abs(random()) % 2592000))),
  (23, 'S0T1U2V3', 60000023, 'delivered', '1579 Apricot Ave, Shelbyville, 20004','self',     165000,  'Call ahead', (strftime('%s','now') - (abs(random()) % 2592000))),
  (24, 'W0X1Y2Z3', 60000024, 'shipped',   '1680 Guava Rd, Shelbyville, 20005','avidaa',       58000,  NULL, (strftime('%s','now') - (abs(random()) % 2592000))),
  (25, 'A2B3C4D5', 60000025, 'delivered', '1791 Coconut St, North Haverbrook, 40004','tu-delivery',  205000, NULL, (strftime('%s','now') - (abs(random()) % 2592000))),
  (26, 'E2F3G4H5', 60000026, 'pending',   '1802 Avocado Ave, North Haverbrook, 40005','self',  88000, NULL, (strftime('%s','now') - (abs(random()) % 2592000))),
  (27, 'J2K3L4M5', 60000027, 'delivered', '1913 Cherry Blossom Rd, Capital City, 50004','avidaa',  112000, 'Deliver to reception', (strftime('%s','now') - (abs(random()) % 2592000))),
  (28, 'N2P3Q4R5', 60000028, 'delivered', '2024 Willow St, Capital City, 50005','tu-delivery', 72000, NULL, (strftime('%s','now') - (abs(random()) % 2592000))),
  (29, 'S2T3U4V5', 60000029, 'refunded',  '2135 Poplar Ave, Cypress Creek, 60004','self',     140000, 'Refunded', (strftime('%s','now') - (abs(random()) % 2592000))),
  (30, 'W2X3Y4Z5', 60000030, 'delivered', '2246 Sycamore Rd, Cypress Creek, 60005','avidaa',  103000, NULL, (strftime('%s','now') - (abs(random()) % 2592000))),
  (31, 'C1D2E3F4', 60000001, 'delivered', '123 Main St, Springfield, 10001','tu-delivery',    54000, NULL, (strftime('%s','now') - (abs(random()) % 2592000))),
  (32, 'G5H6I7J8', 60000002, 'shipped',   '456 Oak Ave, Springfield, 10002','self',           96000, 'Please hurry', (strftime('%s','now') - (abs(random()) % 2592000))),
  (33, 'K9L8M7N6', 60000003, 'delivered', '789 Pine Rd, Springfield, 10003','avidaa',         47000, NULL, (strftime('%s','now') - (abs(random()) % 2592000))),
  (34, 'O5P4Q3R2', 60000004, 'pending',   '12 Maple St, Shelbyville, 20001','tu-delivery',    73000, NULL, (strftime('%s','now') - (abs(random()) % 2592000))),
  (35, 'U1V2W3X4', 60000005, 'delivered', '34 Elm Ave, Shelbyville, 20002','self',           158000, 'Weekend delivery', (strftime('%s','now') - (abs(random()) % 2592000)));

-- Seed Order Details (per order)
INSERT INTO ecom_vit_order_detail (order_id, product_id, quantity) VALUES
  -- Order 1 total 80000: p1 x2 (50000) + p2 x1 (30000)
  (1, 1, 2), (1, 2, 1),
  -- Order 2 total 150000: p3 x1 (55000) + p9 x1 (80000) + p7 x2 (44000) => actually 55000+80000+44000=179000; adjust to p7 x0 -> keep p3 x1 + p10 x1 (120000) = 175000? Our order 2 total says 150000. Use p3 x1 (55000) + p11 x1 (35000) + p20 x1 (50000) = 140000; but header 150000. We'll override details to match 150000: p3 x1 (55000) + p20 x1 (50000) + p7 x2 (44000) = 149000; add p15 x1 (18000) -> 167000; too high. Better: p9 x1 (80000) + p6 x1 (75000) = 155000; adjust order total later. We'll keep details and reconcile totals below.
  (2, 9, 1), (2, 6, 1),
  -- Order 3 total 95000: p13 x1 (95000)
  (3, 13, 1),
  -- Order 4 total 140000: p9 x1 (80000) + p8 x1 (45000) + p7 x0 => need 140000 => p11 x2 (70000) no; Let's set p10 x1 (120000) + p1 x1 (25000) => 145000. We'll set p8 x2 (90000) + p5 x1 (65000) = 155000. Instead set p4 x1 (90000) + p3 x1 (55000) = 145000. We'll change order total later to match.
  (4, 4, 1), (4, 3, 1),
  -- Order 5 total 47000: p8 x1 (45000) + p15 x1 (18000) => 63000 too high. Use p7 x1 (22000) + p15 x1 (18000) + p11 x1 (35000) => 75000. We'll use p8 x1 (45000) + p7 x1 (22000) = 67000; We'll just reconcile totals later.
  (5, 8, 1), (5, 7, 1),
  -- Order 6 total 200000: p10 x1 (120000) + p4 x1 (90000) = 210000, adjust later.
  (6, 10, 1), (6, 4, 1),
  -- Order 7 total 57000: p11 x1 (35000) + p15 x1 (18000) = 53000; add p7 x1 (22000) => 75000; Remove p7 -> keep p11 x1 + p17 x1 (27000) = 62000; We'll use p11 x1 + p15 x1 = 53000 and adjust later.
  (7, 11, 1), (7, 15, 1),
  -- Order 8 total 175000: p10 x1 (120000) + p6 x1 (75000) = 195000; use p13 x1 (95000) + p9 x1 (80000) = 175000
  (8, 13, 1), (8, 9, 1),
  -- Order 9 total 60000: p2 x2 (60000)
  (9, 2, 2),
  -- Order 10 total 220000: p10 x1 (120000) + p9 x1 (80000) + p1 x1 (25000) = 225000; Keep p10 x1 + p9 x1 = 200000; add p20 x1 (50000)=> 250000. We'll change total later.
  (10, 10, 1), (10, 9, 1), (10, 20, 1),
  -- Order 11 total 125000: p6 x1 (75000) + p11 x1 (35000) + p7 x1 (22000) = 132000; adjust later.
  (11, 6, 1), (11, 11, 1), (11, 7, 1),
  -- Order 12 total 35000: p11 x1 (35000)
  (12, 11, 1),
  -- Order 13 total 95000: p13 x1 (95000)
  (13, 13, 1),
  -- Order 14 total 88000: p23 x1 (65000) + p15 x1 (18000) = 83000; add p7 x1 (22000) => 105000; We'll change total later.
  (14, 23, 1), (14, 15, 1),
  -- Order 15 total 53000: p11 x1 (35000) + p7 x1 (22000) = 57000; adjust later.
  (15, 11, 1), (15, 7, 1),
  -- Order 16 total 62000: p21 x1 (60000) + p15 x1 (18000) = 78000; use p1 x1 (25000) + p17 x1 (27000) + p15 x1 (18000) = 70000; We'll adjust later.
  (16, 1, 1), (16, 17, 1), (16, 15, 1),
  -- Order 17 total 100000: p19 x1 (70000) + p2 x1 (30000) = 100000
  (17, 19, 1), (17, 2, 1),
  -- Order 18 total 127000: p20 x1 (50000) + p18 x1 (32000) + p1 x1 (25000) + p7 x1 (22000) = 129000; We'll change total later.
  (18, 20, 1), (18, 18, 1), (18, 1, 1), (18, 7, 1),
  -- Order 19 total 95000: p9 x1 (80000) + p1 x1 (25000) => 105000; use p23 x1 (65000) + p17 x1 (27000) = 92000; We'll change later.
  (19, 23, 1), (19, 17, 1),
  -- Order 20 total 130000: p25 x1 (85000) + p1 x1 (25000) + p7 x1 (22000) = 132000; close enough; adjust later.
  (20, 25, 1), (20, 1, 1), (20, 7, 1),
  -- Order 21 total 120000: p10 x1 (120000)
  (21, 10, 1),
  -- Order 22 total 87000: p23 x1 (65000) + p7 x1 (22000) = 87000
  (22, 23, 1), (22, 7, 1),
  -- Order 23 total 165000: p9 x1 (80000) + p6 x1 (75000) + p1 x1 (25000) = 180000; adjust later.
  (23, 9, 1), (23, 6, 1), (23, 1, 1),
  -- Order 24 total 58000: p11 x1 (35000) + p15 x1 (18000) = 53000; add p7 x1 (22000) => 75000; We'll change later.
  (24, 11, 1), (24, 15, 1),
  -- Order 25 total 205000: p10 x1 (120000) + p9 x1 (80000) + p1 x2 (50000) => 250000; We'll use p10 x1 + p13 x1 (95000) = 215000; adjust later.
  (25, 10, 1), (25, 13, 1),
  -- Order 26 total 88000: p21 x1 (60000) + p1 x1 (25000) = 85000; add p15 x1 (18000) => 103000; We'll change later.
  (26, 21, 1), (26, 1, 1),
  -- Order 27 total 112000: p22 x1 (60000) + p18 x1 (32000) + p7 x1 (22000) = 114000; adjust later.
  (27, 22, 1), (27, 18, 1), (27, 7, 1),
  -- Order 28 total 72000: p18 x1 (32000) + p1 x2 (50000) = 82000; Instead p20 x1 (50000) + p1 x1 (25000) = 75000; adjust later.
  (28, 20, 1), (28, 1, 1),
  -- Order 29 total 140000: p25 x1 (85000) + p23 x1 (65000) = 150000; We'll change later.
  (29, 25, 1), (29, 23, 1),
  -- Order 30 total 103000: p9 x1 (80000) + p1 x1 (25000) = 105000; adjust later.
  (30, 9, 1), (30, 1, 1),
  -- Order 31 total 54000: p1 x1 (25000) + p12 x1 (28000) = 53000; add p15 x1 (18000) => 71000; We'll adjust later.
  (31, 1, 1), (31, 12, 1),
  -- Order 32 total 96000: p3 x1 (55000) + p1 x1 (25000) + p7 x1 (22000) = 102000; adjust later.
  (32, 3, 1), (32, 1, 1), (32, 7, 1),
  -- Order 33 total 47000: p11 x1 (35000) + p15 x1 (18000) = 53000; adjust later.
  (33, 11, 1), (33, 15, 1),
  -- Order 34 total 73000: p1 x1 (25000) + p2 x1 (30000) + p7 x1 (22000) = 77000; adjust later.
  (34, 1, 1), (34, 2, 1), (34, 7, 1),
  -- Order 35 total 158000: p23 x1 (65000) + p10 x1 (120000) = 185000; adjust later.
  (35, 23, 1), (35, 10, 1);

-- Payments (one per order)
-- Mix of providers: qpay, transfer, cash; status: pending, success, failed
INSERT INTO ecom_vit_payment (order_id, provider, status, created_at)
VALUES
  (1,  'transfer', 'success', (strftime('%s','now') - (abs(random()) % 2592000))),
  (2,  'qpay',     'pending', (strftime('%s','now') - (abs(random()) % 2592000))),
  (3,  'cash',     'success', (strftime('%s','now') - (abs(random()) % 2592000))),
  (4,  'transfer', 'success', (strftime('%s','now') - (abs(random()) % 2592000))),
  (5,  'cash',     'failed',  (strftime('%s','now') - (abs(random()) % 2592000))),
  (6,  'qpay',     'success', (strftime('%s','now') - (abs(random()) % 2592000))),
  (7,  'transfer', 'pending', (strftime('%s','now') - (abs(random()) % 2592000))),
  (8,  'cash',     'success', (strftime('%s','now') - (abs(random()) % 2592000))),
  (9,  'qpay',     'failed',  (strftime('%s','now') - (abs(random()) % 2592000))),
  (10, 'transfer', 'success', (strftime('%s','now') - (abs(random()) % 2592000))),
  (11, 'qpay',     'success', (strftime('%s','now') - (abs(random()) % 2592000))),
  (12, 'cash',     'pending', (strftime('%s','now') - (abs(random()) % 2592000))),
  (13, 'transfer', 'success', (strftime('%s','now') - (abs(random()) % 2592000))),
  (14, 'qpay',     'success', (strftime('%s','now') - (abs(random()) % 2592000))),
  (15, 'cash',     'failed',  (strftime('%s','now') - (abs(random()) % 2592000))),
  (16, 'transfer', 'success', (strftime('%s','now') - (abs(random()) % 2592000))),
  (17, 'cash',     'success', (strftime('%s','now') - (abs(random()) % 2592000))),
  (18, 'qpay',     'success', (strftime('%s','now') - (abs(random()) % 2592000))),
  (19, 'transfer', 'failed',  (strftime('%s','now') - (abs(random()) % 2592000))),
  (20, 'cash',     'success', (strftime('%s','now') - (abs(random()) % 2592000))),
  (21, 'qpay',     'pending', (strftime('%s','now') - (abs(random()) % 2592000))),
  (22, 'transfer', 'success', (strftime('%s','now') - (abs(random()) % 2592000))),
  (23, 'cash',     'success', (strftime('%s','now') - (abs(random()) % 2592000))),
  (24, 'qpay',     'success', (strftime('%s','now') - (abs(random()) % 2592000))),
  (25, 'transfer', 'success', (strftime('%s','now') - (abs(random()) % 2592000))),
  (26, 'cash',     'pending', (strftime('%s','now') - (abs(random()) % 2592000))),
  (27, 'qpay',     'success', (strftime('%s','now') - (abs(random()) % 2592000))),
  (28, 'transfer', 'success', (strftime('%s','now') - (abs(random()) % 2592000))),
  (29, 'cash',     'failed',  (strftime('%s','now') - (abs(random()) % 2592000))),
  (30, 'qpay',     'success', (strftime('%s','now') - (abs(random()) % 2592000))),
  (31, 'transfer', 'success', (strftime('%s','now') - (abs(random()) % 2592000))),
  (32, 'cash',     'success', (strftime('%s','now') - (abs(random()) % 2592000))),
  (33, 'qpay',     'success', (strftime('%s','now') - (abs(random()) % 2592000))),
  (34, 'transfer', 'pending', (strftime('%s','now') - (abs(random()) % 2592000))),
  (35, 'cash',     'success', (strftime('%s','now') - (abs(random()) % 2592000)));

-- Reconcile order totals to match inserted details
-- Update totals to reflect the actual sums we chose above
UPDATE ecom_vit_order SET total = 80000 WHERE id = 1; -- p1x2 (50000) + p2x1 (30000)
UPDATE ecom_vit_order SET total = 155000 WHERE id = 2; -- p9x1 (80000) + p6x1 (75000)
UPDATE ecom_vit_order SET total = 95000 WHERE id = 3;  -- p13x1
UPDATE ecom_vit_order SET total = 145000 WHERE id = 4; -- p4x1 (90000) + p3x1 (55000)
UPDATE ecom_vit_order SET total = 67000 WHERE id = 5;  -- p8x1 (45000) + p7x1 (22000)
UPDATE ecom_vit_order SET total = 210000 WHERE id = 6; -- p10x1 (120000) + p4x1 (90000)
UPDATE ecom_vit_order SET total = 53000 WHERE id = 7;  -- p11x1 (35000) + p15x1 (18000)
UPDATE ecom_vit_order SET total = 175000 WHERE id = 8; -- p13x1 + p9x1
UPDATE ecom_vit_order SET total = 60000 WHERE id = 9;  -- p2x2
UPDATE ecom_vit_order SET total = 250000 WHERE id = 10;-- p10x1 + p9x1 + p20x1
UPDATE ecom_vit_order SET total = 132000 WHERE id = 11;-- p6x1 + p11x1 + p7x1
UPDATE ecom_vit_order SET total = 35000 WHERE id = 12; -- p11x1
UPDATE ecom_vit_order SET total = 95000 WHERE id = 13; -- p13x1
UPDATE ecom_vit_order SET total = 83000 WHERE id = 14; -- p23x1 + p15x1
UPDATE ecom_vit_order SET total = 57000 WHERE id = 15; -- p11x1 + p7x1
UPDATE ecom_vit_order SET total = 70000 WHERE id = 16; -- p1x1 + p17x1 + p15x1
UPDATE ecom_vit_order SET total = 100000 WHERE id = 17;-- p19x1 + p2x1
UPDATE ecom_vit_order SET total = 129000 WHERE id = 18;-- p20x1 + p18x1 + p1x1 + p7x1
UPDATE ecom_vit_order SET total = 92000 WHERE id = 19; -- p23x1 + p17x1
UPDATE ecom_vit_order SET total = 132000 WHERE id = 20;-- p25x1 + p1x1 + p7x1
UPDATE ecom_vit_order SET total = 120000 WHERE id = 21;-- p10x1
UPDATE ecom_vit_order SET total = 87000 WHERE id = 22; -- p23x1 + p7x1
UPDATE ecom_vit_order SET total = 180000 WHERE id = 23;-- p9x1 + p6x1 + p1x1
UPDATE ecom_vit_order SET total = 53000 WHERE id = 24; -- p11x1 + p15x1
UPDATE ecom_vit_order SET total = 215000 WHERE id = 25;-- p10x1 + p13x1
UPDATE ecom_vit_order SET total = 85000 WHERE id = 26; -- p21x1 + p1x1
UPDATE ecom_vit_order SET total = 114000 WHERE id = 27;-- p22x1 + p18x1 + p7x1
UPDATE ecom_vit_order SET total = 75000 WHERE id = 28; -- p20x1 + p1x1
UPDATE ecom_vit_order SET total = 150000 WHERE id = 29;-- p25x1 + p23x1
UPDATE ecom_vit_order SET total = 105000 WHERE id = 30;-- p9x1 + p1x1
UPDATE ecom_vit_order SET total = 53000 WHERE id = 31; -- p1x1 + p12x1
UPDATE ecom_vit_order SET total = 102000 WHERE id = 32;-- p3x1 + p1x1 + p7x1
UPDATE ecom_vit_order SET total = 53000 WHERE id = 33; -- p11x1 + p15x1
UPDATE ecom_vit_order SET total = 77000 WHERE id = 34; -- p1x1 + p2x1 + p7x1
UPDATE ecom_vit_order SET total = 185000 WHERE id = 35;-- p23x1 + p10x1

-- Sales and stock decrements only for orders with successful payments
-- For each successful order, create one sales row per order_detail with product_cost from purchase (70% of price)uu
-- Then decrement product stock by quantity sold

-- Helper comments: unit costs per product
-- p1:17500 p2:21000 p3:38500 p4:63000 p5:45500 p6:52500 p7:15400 p8:31500 p9:56000 p10:84000 p11:24500 p12:19600 p13:66500 p14:28000 p15:12600 p16:42000 p17:18900 p18:22400 p19:49000 p20:35000 p21:42000 p22:42000 p23:45500 p24:26600 p25:59500

-- Order 1 success
INSERT INTO ecom_vit_sales (product_id, order_id, quantity_sold, product_cost, selling_price, discount_applied, created_at)
VALUES (1,1,2,17500,25000,0,(SELECT created_at FROM ecom_vit_order WHERE id=1)),
       (2,1,1,21000,30000,0,(SELECT created_at FROM ecom_vit_order WHERE id=1));
UPDATE ecom_vit_product SET stock = stock - 2 WHERE id = 1;
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 2;

-- Order 3 success
INSERT INTO ecom_vit_sales (product_id, order_id, quantity_sold, product_cost, selling_price, discount_applied, created_at)
VALUES (13,3,1,66500,95000,0,(SELECT created_at FROM ecom_vit_order WHERE id=3));
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 13;

-- Order 4 success
INSERT INTO ecom_vit_sales (product_id, order_id, quantity_sold, product_cost, selling_price, discount_applied, created_at)
VALUES (4,4,1,63000,90000,0,(SELECT created_at FROM ecom_vit_order WHERE id=4));
INSERT INTO ecom_vit_sales (product_id, order_id, quantity_sold, product_cost, selling_price, discount_applied, created_at)
VALUES (3,4,1,38500,55000,0,(SELECT created_at FROM ecom_vit_order WHERE id=4));
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 4;
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 3;

-- Order 6 success
INSERT INTO ecom_vit_sales (product_id, order_id, quantity_sold, product_cost, selling_price, discount_applied, created_at)
VALUES (10,6,1,84000,120000,0,(SELECT created_at FROM ecom_vit_order WHERE id=6));
INSERT INTO ecom_vit_sales (product_id, order_id, quantity_sold, product_cost, selling_price, discount_applied, created_at)
VALUES (4,6,1,63000,90000,0,(SELECT created_at FROM ecom_vit_order WHERE id=6));
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 10;
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 4;

-- Order 8 success
INSERT INTO ecom_vit_sales (product_id, order_id, quantity_sold, product_cost, selling_price, discount_applied, created_at)
VALUES (13,8,1,66500,95000,0,(SELECT created_at FROM ecom_vit_order WHERE id=8));
INSERT INTO ecom_vit_sales (product_id, order_id, quantity_sold, product_cost, selling_price, discount_applied, created_at)
VALUES (9,8,1,56000,80000,0,(SELECT created_at FROM ecom_vit_order WHERE id=8));
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 13;
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 9;

-- Order 10 success
INSERT INTO ecom_vit_sales (product_id, order_id, quantity_sold, product_cost, selling_price, discount_applied, created_at)
VALUES (10,10,1,84000,120000,0,(SELECT created_at FROM ecom_vit_order WHERE id=10));
INSERT INTO ecom_vit_sales (product_id, order_id, quantity_sold, product_cost, selling_price, discount_applied, created_at)
VALUES (9,10,1,56000,80000,0,(SELECT created_at FROM ecom_vit_order WHERE id=10));
INSERT INTO ecom_vit_sales (product_id, order_id, quantity_sold, product_cost, selling_price, discount_applied, created_at)
VALUES (20,10,1,35000,50000,0,(SELECT created_at FROM ecom_vit_order WHERE id=10));
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 10;
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 9;
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 20;

-- Order 11 success
INSERT INTO ecom_vit_sales (product_id, order_id, quantity_sold, product_cost, selling_price, discount_applied, created_at)
VALUES (6,11,1,52500,75000,0,(SELECT created_at FROM ecom_vit_order WHERE id=11));
INSERT INTO ecom_vit_sales (product_id, order_id, quantity_sold, product_cost, selling_price, discount_applied, created_at)
VALUES (11,11,1,24500,35000,0,(SELECT created_at FROM ecom_vit_order WHERE id=11));
INSERT INTO ecom_vit_sales (product_id, order_id, quantity_sold, product_cost, selling_price, discount_applied, created_at)
VALUES (7,11,1,15400,22000,0,(SELECT created_at FROM ecom_vit_order WHERE id=11));
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 6;
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 11;
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 7;

-- Order 13 success
INSERT INTO ecom_vit_sales (product_id, order_id, quantity_sold, product_cost, selling_price, discount_applied, created_at)
VALUES (13,13,1,66500,95000,0,(SELECT created_at FROM ecom_vit_order WHERE id=13));
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 13;

-- Order 14 success
INSERT INTO ecom_vit_sales (product_id, order_id, quantity_sold, product_cost, selling_price, discount_applied, created_at)
VALUES (23,14,1,45500,65000,0,(SELECT created_at FROM ecom_vit_order WHERE id=14));
INSERT INTO ecom_vit_sales (product_id, order_id, quantity_sold, product_cost, selling_price, discount_applied, created_at)
VALUES (15,14,1,12600,18000,0,(SELECT created_at FROM ecom_vit_order WHERE id=14));
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 23;
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 15;

-- Order 16 success
INSERT INTO ecom_vit_sales (product_id, order_id, quantity_sold, product_cost, selling_price, discount_applied, created_at)
VALUES (1,16,1,17500,25000,0,(SELECT created_at FROM ecom_vit_order WHERE id=16));
INSERT INTO ecom_vit_sales (product_id, order_id, quantity_sold, product_cost, selling_price, discount_applied, created_at)
VALUES (17,16,1,18900,27000,0,(SELECT created_at FROM ecom_vit_order WHERE id=16));
INSERT INTO ecom_vit_sales (product_id, order_id, quantity_sold, product_cost, selling_price, discount_applied, created_at)
VALUES (15,16,1,12600,18000,0,(SELECT created_at FROM ecom_vit_order WHERE id=16));
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 1;
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 17;
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 15;

-- Order 17 success
INSERT INTO ecom_vit_sales (product_id, order_id, quantity_sold, product_cost, selling_price, discount_applied, created_at)
VALUES (19,17,1,49000,70000,0,(SELECT created_at FROM ecom_vit_order WHERE id=17));
INSERT INTO ecom_vit_sales (product_id, order_id, quantity_sold, product_cost, selling_price, discount_applied, created_at)
VALUES (2,17,1,21000,30000,0,(SELECT created_at FROM ecom_vit_order WHERE id=17));
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 19;
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 2;

-- Order 18 success
INSERT INTO ecom_vit_sales (product_id, order_id, quantity_sold, product_cost, selling_price, discount_applied, created_at)
VALUES (20,18,1,35000,50000,0,(SELECT created_at FROM ecom_vit_order WHERE id=18));
INSERT INTO ecom_vit_sales (product_id, order_id, quantity_sold, product_cost, selling_price, discount_applied, created_at)
VALUES (18,18,1,22400,32000,0,(SELECT created_at FROM ecom_vit_order WHERE id=18));
INSERT INTO ecom_vit_sales (product_id, order_id, quantity_sold, product_cost, selling_price, discount_applied, created_at)
VALUES (1,18,1,17500,25000,0,(SELECT created_at FROM ecom_vit_order WHERE id=18));
INSERT INTO ecom_vit_sales (product_id, order_id, quantity_sold, product_cost, selling_price, discount_applied, created_at)
VALUES (7,18,1,15400,22000,0,(SELECT created_at FROM ecom_vit_order WHERE id=18));
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 20;
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 18;
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 1;
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 7;

-- Order 20 success
INSERT INTO ecom_vit_sales (product_id, order_id, quantity_sold, product_cost, selling_price, discount_applied, created_at)
VALUES (25,20,1,59500,85000,0,(SELECT created_at FROM ecom_vit_order WHERE id=20));
INSERT INTO ecom_vit_sales (product_id, order_id, quantity_sold, product_cost, selling_price, discount_applied, created_at)
VALUES (1,20,1,17500,25000,0,(SELECT created_at FROM ecom_vit_order WHERE id=20));
INSERT INTO ecom_vit_sales (product_id, order_id, quantity_sold, product_cost, selling_price, discount_applied, created_at)
VALUES (7,20,1,15400,22000,0,(SELECT created_at FROM ecom_vit_order WHERE id=20));
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 25;
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 1;
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 7;

-- Order 22 success
INSERT INTO ecom_vit_sales (product_id, order_id, quantity_sold, product_cost, selling_price, discount_applied, created_at)
VALUES (23,22,1,45500,65000,0,(SELECT created_at FROM ecom_vit_order WHERE id=22));
INSERT INTO ecom_vit_sales (product_id, order_id, quantity_sold, product_cost, selling_price, discount_applied, created_at)
VALUES (7,22,1,15400,22000,0,(SELECT created_at FROM ecom_vit_order WHERE id=22));
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 23;
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 7;

-- Order 23 success
INSERT INTO ecom_vit_sales (product_id, order_id, quantity_sold, product_cost, selling_price, discount_applied, created_at)
VALUES (9,23,1,56000,80000,0,(SELECT created_at FROM ecom_vit_order WHERE id=23));
INSERT INTO ecom_vit_sales (product_id, order_id, quantity_sold, product_cost, selling_price, discount_applied, created_at)
VALUES (6,23,1,52500,75000,0,(SELECT created_at FROM ecom_vit_order WHERE id=23));
INSERT INTO ecom_vit_sales (product_id, order_id, quantity_sold, product_cost, selling_price, discount_applied, created_at)
VALUES (1,23,1,17500,25000,0,(SELECT created_at FROM ecom_vit_order WHERE id=23));
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 9;
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 6;
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 1;

-- Order 24 success
INSERT INTO ecom_vit_sales (product_id, order_id, quantity_sold, product_cost, selling_price, discount_applied, created_at)
VALUES (11,24,1,24500,35000,0,(SELECT created_at FROM ecom_vit_order WHERE id=24));
INSERT INTO ecom_vit_sales (product_id, order_id, quantity_sold, product_cost, selling_price, discount_applied, created_at)
VALUES (15,24,1,12600,18000,0,(SELECT created_at FROM ecom_vit_order WHERE id=24));
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 11;
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 15;

-- Order 25 success
INSERT INTO ecom_vit_sales (product_id, order_id, quantity_sold, product_cost, selling_price, discount_applied, created_at)
VALUES (10,25,1,84000,120000,0,(SELECT created_at FROM ecom_vit_order WHERE id=25));
INSERT INTO ecom_vit_sales (product_id, order_id, quantity_sold, product_cost, selling_price, discount_applied, created_at)
VALUES (13,25,1,66500,95000,0,(SELECT created_at FROM ecom_vit_order WHERE id=25));
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 10;
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 13;

-- Order 27 success
INSERT INTO ecom_vit_sales (product_id, order_id, quantity_sold, product_cost, selling_price, discount_applied, created_at)
VALUES (22,27,1,42000,60000,0,(SELECT created_at FROM ecom_vit_order WHERE id=27));
INSERT INTO ecom_vit_sales (product_id, order_id, quantity_sold, product_cost, selling_price, discount_applied, created_at)
VALUES (18,27,1,22400,32000,0,(SELECT created_at FROM ecom_vit_order WHERE id=27));
INSERT INTO ecom_vit_sales (product_id, order_id, quantity_sold, product_cost, selling_price, discount_applied, created_at)
VALUES (7,27,1,15400,22000,0,(SELECT created_at FROM ecom_vit_order WHERE id=27));
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 22;
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 18;
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 7;

-- Order 28 success
INSERT INTO ecom_vit_sales (product_id, order_id, quantity_sold, product_cost, selling_price, discount_applied, created_at)
VALUES (20,28,1,35000,50000,0,(SELECT created_at FROM ecom_vit_order WHERE id=28));
INSERT INTO ecom_vit_sales (product_id, order_id, quantity_sold, product_cost, selling_price, discount_applied, created_at)
VALUES (1,28,1,17500,25000,0,(SELECT created_at FROM ecom_vit_order WHERE id=28));
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 20;
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 1;

-- Order 30 success
INSERT INTO ecom_vit_sales (product_id, order_id, quantity_sold, product_cost, selling_price, discount_applied, created_at)
VALUES (9,30,1,56000,80000,0,(SELECT created_at FROM ecom_vit_order WHERE id=30));
INSERT INTO ecom_vit_sales (product_id, order_id, quantity_sold, product_cost, selling_price, discount_applied, created_at)
VALUES (1,30,1,17500,25000,0,(SELECT created_at FROM ecom_vit_order WHERE id=30));
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 9;
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 1;

-- Order 31 success
INSERT INTO ecom_vit_sales (product_id, order_id, quantity_sold, product_cost, selling_price, discount_applied, created_at)
VALUES (1,31,1,17500,25000,0,(SELECT created_at FROM ecom_vit_order WHERE id=31));
INSERT INTO ecom_vit_sales (product_id, order_id, quantity_sold, product_cost, selling_price, discount_applied, created_at)
VALUES (12,31,1,19600,28000,0,(SELECT created_at FROM ecom_vit_order WHERE id=31));
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 1;
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 12;

-- Order 32 success
INSERT INTO ecom_vit_sales (product_id, order_id, quantity_sold, product_cost, selling_price, discount_applied, created_at)
VALUES (3,32,1,38500,55000,0,(SELECT created_at FROM ecom_vit_order WHERE id=32));
INSERT INTO ecom_vit_sales (product_id, order_id, quantity_sold, product_cost, selling_price, discount_applied, created_at)
VALUES (1,32,1,17500,25000,0,(SELECT created_at FROM ecom_vit_order WHERE id=32));
INSERT INTO ecom_vit_sales (product_id, order_id, quantity_sold, product_cost, selling_price, discount_applied, created_at)
VALUES (7,32,1,15400,22000,0,(SELECT created_at FROM ecom_vit_order WHERE id=32));
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 3;
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 1;
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 7;

-- Order 33 success
INSERT INTO ecom_vit_sales (product_id, order_id, quantity_sold, product_cost, selling_price, discount_applied, created_at)
VALUES (11,33,1,24500,35000,0,(SELECT created_at FROM ecom_vit_order WHERE id=33));
INSERT INTO ecom_vit_sales (product_id, order_id, quantity_sold, product_cost, selling_price, discount_applied, created_at)
VALUES (15,33,1,12600,18000,0,(SELECT created_at FROM ecom_vit_order WHERE id=33));
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 11;
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 15;

-- Order 35 success
INSERT INTO ecom_vit_sales (product_id, order_id, quantity_sold, product_cost, selling_price, discount_applied, created_at)
VALUES (23,35,1,45500,65000,0,(SELECT created_at FROM ecom_vit_order WHERE id=35));
INSERT INTO ecom_vit_sales (product_id, order_id, quantity_sold, product_cost, selling_price, discount_applied, created_at)
VALUES (10,35,1,84000,120000,0,(SELECT created_at FROM ecom_vit_order WHERE id=35));
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 23;
UPDATE ecom_vit_product SET stock = stock - 1 WHERE id = 10;

PRAGMA foreign_keys = ON;
COMMIT;


