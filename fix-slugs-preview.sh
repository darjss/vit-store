#!/usr/bin/env bash
# Fix product slugs script
# This script regenerates clean slugs for products that have problematic characters

set -e

# Load environment variables from .env.prod
if [ -f .env.prod ]; then
  export $(grep -E '^(PLANETSCALE_)' .env.prod | xargs)
fi

# Check if required vars are set
if [ -z "$PLANETSCALE_HOST" ] || [ -z "$PLANETSCALE_USER" ] || [ -z "$PLANETSCALE_PASSWORD" ] || [ -z "$PLANETSCALE_DATABASE" ]; then
  echo "Error: Database credentials not found in .env.prod"
  echo "Required: PLANETSCALE_HOST, PLANETSCALE_USER, PLANETSCALE_PASSWORD, PLANETSCALE_DATABASE"
  exit 1
fi

echo "Connecting to database at $PLANETSCALE_HOST..."

# SQL to fix slugs
# This will:
# 1. Create a function to generate clean slugs
# 2. Update all products with problematic slugs
# 3. Regenerate slugs from the product name

psql "postgresql://$PLANETSCALE_USER:$PLANETSCALE_PASSWORD@$PLANETSCALE_HOST:5432/$PLANETSCALE_DATABASE?sslmode=require" << 'EOF'
-- Create a function to generate clean slugs
CREATE OR REPLACE FUNCTION generate_clean_slug(input_text TEXT)
RETURNS TEXT AS $$
DECLARE
    clean_text TEXT;
BEGIN
    -- Convert to lowercase
    clean_text := LOWER(input_text);
    
    -- Replace any non-alphanumeric characters with hyphens
    clean_text := REGEXP_REPLACE(clean_text, '[^a-z0-9]+', '-', 'g');
    
    -- Remove leading and trailing hyphens
    clean_text := REGEXP_REPLACE(clean_text, '^-+|-+$', '', 'g');
    
    RETURN clean_text;
END;
$$ LANGUAGE plpgsql;

-- First, let's see what products have problematic slugs
SELECT 
    id,
    name,
    slug,
    generate_clean_slug(name) as new_slug
FROM product
WHERE slug ~ '[^a-z0-9-]'
   OR slug ~ '[|,<>&/\\{}\[\]()$@#!%*?+=:;"''`~.]'
ORDER BY id;

-- Count how many products will be affected
SELECT COUNT(*) as products_to_fix
FROM product
WHERE slug ~ '[^a-z0-9-]'
   OR slug ~ '[|,<>&/\\{}\[\]()$@#!%*?+=:;"''`~.]';
EOF

echo ""
echo "Review the output above. The script shows products with problematic slugs."
echo "To actually apply the fixes, run: ./fix-slugs-apply.sh"
