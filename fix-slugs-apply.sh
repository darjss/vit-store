#!/usr/bin/env bash
# Fix product slugs - APPLY CHANGES
# This script actually updates the database with clean slugs

set -e

# Load environment variables from .env.prod
if [ -f .env.prod ]; then
  export $(grep -E '^(PLANETSCALE_)' .env.prod | xargs)
fi

# Check if required vars are set
if [ -z "$PLANETSCALE_HOST" ] || [ -z "$PLANETSCALE_USER" ] || [ -z "$PLANETSCALE_PASSWORD" ] || [ -z "$PLANETSCALE_DATABASE" ]; then
  echo "Error: Database credentials not found in .env.prod"
  exit 1
fi

echo "⚠️  WARNING: This will update product slugs in the database!"
echo ""
echo "Products will get new slugs based on their current names."
echo "Old URLs will break if slugs change."
echo ""
read -p "Are you sure? Type 'yes' to continue: " confirm

if [ "$confirm" != "yes" ]; then
  echo "Aborted."
  exit 1
fi

echo ""
echo "Applying slug fixes..."

psql "postgresql://$PLANETSCALE_USER:$PLANETSCALE_PASSWORD@$PLANETSCALE_HOST:5432/$PLANETSCALE_DATABASE?sslmode=require" << 'EOF'
-- Create a function to generate clean slugs if not exists
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

-- Update slugs - but handle duplicates by appending the product id
WITH fixed_slugs AS (
    SELECT 
        id,
        name,
        slug as old_slug,
        generate_clean_slug(name) || '-' || id as new_slug
    FROM product
    WHERE slug ~ '[^a-z0-9-]'
       OR slug ~ '[|,<>&/\\{}\[\]()$@#!%*?+=:;"''`~.]'
)
UPDATE product 
SET slug = fixed_slugs.new_slug
FROM fixed_slugs
WHERE product.id = fixed_slugs.id;

-- Show summary
SELECT 
    'Updated ' || COUNT(*) || ' products' as summary
FROM product
WHERE slug !~ '[^a-z0-9-]'
   AND slug !~ '[|,<>&/\\{}\[\]()$@#!%*?+=:;"''`~.]';

-- Show sample of fixed products
SELECT id, name, slug
FROM product
ORDER BY id DESC
LIMIT 10;
EOF

echo ""
echo "✅ Slug fixes applied!"
echo ""
echo "Next steps:"
echo "1. Rebuild the frontend: cd apps/storev2 && bun run astro build"
echo "2. Redeploy to Cloudflare"
