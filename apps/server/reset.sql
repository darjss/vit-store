-- Reset database by dropping all tables in correct order
DROP TABLE IF EXISTS ecom_vit_sales;
DROP TABLE IF EXISTS ecom_vit_cart_item;
DROP TABLE IF EXISTS ecom_vit_payment;
DROP TABLE IF EXISTS ecom_vit_order_detail;
DROP TABLE IF EXISTS ecom_vit_cart;
DROP TABLE IF EXISTS ecom_vit_order;
DROP TABLE IF EXISTS ecom_vit_purchase;
DROP TABLE IF EXISTS ecom_vit_product_image;
DROP TABLE IF EXISTS ecom_vit_product;
DROP TABLE IF EXISTS ecom_vit_customer;
DROP TABLE IF EXISTS ecom_vit_category;
DROP TABLE IF EXISTS ecom_vit_brand;
DROP TABLE IF EXISTS ecom_vit_user;
DROP TABLE IF EXISTS drizzle_migrations;