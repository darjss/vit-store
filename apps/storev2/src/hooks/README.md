# useSearchParams Hook

A powerful custom hook for managing URL search parameters in Solid.js components within Astro projects.

## Features

- 🔄 Reactive search parameter management
- 🎯 Type-safe API
- 🔙 Browser back/forward support
- 📦 Multiple parameter operations
- 🎨 Works seamlessly with Astro's `client:load` directive
- 🔔 Optional change callbacks

## Installation

The hook is already available in your project at `@/hooks/use-search-params`.

## Basic Usage

```tsx
import { useSearchParams } from "@/hooks/use-search-params";

function ProductFilter() {
  const { get, set, remove } = useSearchParams();

  return (
    <div>
      <input
        type="text"
        value={get('search') || ''}
        onInput={(e) => set('search', e.currentTarget.value)}
      />
      <button onClick={() => remove('search')}>Clear</button>
    </div>
  );
}
```

## API Reference

### `useSearchParams(options?)`

Returns an object with methods to manage search parameters.

#### Options

```typescript
interface UseSearchParamsOptions {
  // Replace history state instead of pushing (default: false)
  replaceState?: boolean;
  
  // Callback fired when params change
  onChange?: (params: URLSearchParams) => void;
}
```

#### Return Value

```typescript
interface SearchParamsReturn {
  // Get a specific parameter
  get: (key: string) => string | null;
  
  // Get all parameters as an object
  getAll: () => Record<string, string>;
  
  // Set a single parameter
  set: (key: string, value: string) => void;
  
  // Set multiple parameters at once
  setMultiple: (params: Record<string, string>) => void;
  
  // Remove a single parameter
  remove: (key: string) => void;
  
  // Remove multiple parameters
  removeMultiple: (keys: string[]) => void;
  
  // Clear all parameters
  clear: () => void;
  
  // Check if parameter exists
  has: (key: string) => boolean;
  
  // Get raw URLSearchParams (reactive)
  params: () => URLSearchParams;
  
  // Get query string
  toString: () => string;
}
```

## Examples

### Simple Search

```tsx
function SearchBox() {
  const { get, set } = useSearchParams();

  return (
    <input
      type="text"
      value={get('q') || ''}
      onInput={(e) => set('q', e.currentTarget.value)}
      placeholder="Search..."
    />
  );
}
```

### Multiple Filters

```tsx
function ProductFilters() {
  const { get, setMultiple, clear, has } = useSearchParams();

  const applyFilters = () => {
    setMultiple({
      category: 'vitamins',
      brand: 'nature-made',
      minPrice: '10',
      maxPrice: '50'
    });
  };

  return (
    <div>
      <button onClick={applyFilters}>Apply Filters</button>
      {has('category') && <button onClick={clear}>Clear All</button>}
    </div>
  );
}
```

### With onChange Callback

```tsx
function FilteredProducts() {
  const [products, setProducts] = createSignal([]);
  
  const { get, set } = useSearchParams({
    onChange: async (params) => {
      // Refetch products when params change
      const category = params.get('category');
      const search = params.get('search');
      
      const results = await fetchProducts({ category, search });
      setProducts(results);
    }
  });

  return <ProductList products={products()} />;
}
```

### Replace State (No History)

```tsx
function LiveSearch() {
  const { set } = useSearchParams({
    replaceState: true // Don't add to history
  });

  return (
    <input
      onInput={(e) => set('search', e.currentTarget.value)}
    />
  );
}
```

### Syncing with Local State

```tsx
function CategoryFilter() {
  const { get, set } = useSearchParams();
  const [category, setCategory] = createSignal(get('category') || '');

  // Sync URL with local state
  createEffect(() => {
    const urlCategory = get('category') || '';
    if (urlCategory !== category()) {
      setCategory(urlCategory);
    }
  });

  const handleChange = (value: string) => {
    setCategory(value);
    set('category', value);
  };

  return (
    <select value={category()} onChange={(e) => handleChange(e.currentTarget.value)}>
      <option value="">All</option>
      <option value="vitamins">Vitamins</option>
      <option value="supplements">Supplements</option>
    </select>
  );
}
```

### Using in Astro Pages

```astro
---
// products/index.astro
export const prerender = false; // Important!

import Layout from "@/layouts/Layout.astro";
import ProductFilters from "@/components/product/product-filters";
import ProductList from "@/components/product/product-list";

// Get initial params server-side
const category = Astro.url.searchParams.get('category');
const search = Astro.url.searchParams.get('search');
---

<Layout>
  <div class="grid grid-cols-[300px_1fr] gap-6">
    <!-- Client-side filtering -->
    <ProductFilters 
      client:load 
      initialCategory={category}
      initialSearch={search}
    />
    
    <!-- Product list -->
    <ProductList client:load />
  </div>
</Layout>
```

## Best Practices

1. **Set `prerender = false`** in Astro pages that need query params
2. **Empty values remove params**: Setting `''` removes the parameter
3. **Use `replaceState`** for live search to avoid cluttering history
4. **Sync with local state** using `createEffect` for complex UIs
5. **Type your param keys** for better autocomplete:

```typescript
type SearchParamKeys = 'category' | 'brand' | 'search' | 'page';

const getTyped = (key: SearchParamKeys) => get(key);
```

## Common Patterns

### Pagination

```tsx
function Pagination() {
  const { get, set } = useSearchParams();
  const currentPage = () => Number(get('page') || '1');

  return (
    <div>
      <button 
        onClick={() => set('page', String(currentPage() - 1))}
        disabled={currentPage() === 1}
      >
        Previous
      </button>
      <span>Page {currentPage()}</span>
      <button onClick={() => set('page', String(currentPage() + 1))}>
        Next
      </button>
    </div>
  );
}
```

### Sorting

```tsx
function ProductSort() {
  const { get, set } = useSearchParams();

  return (
    <select 
      value={get('sort') || 'name'} 
      onChange={(e) => set('sort', e.currentTarget.value)}
    >
      <option value="name">Name</option>
      <option value="price-asc">Price: Low to High</option>
      <option value="price-desc">Price: High to Low</option>
    </select>
  );
}
```

### Toggle Filters

```tsx
function DiscountFilter() {
  const { has, set, remove } = useSearchParams();

  const toggle = () => {
    if (has('discount')) {
      remove('discount');
    } else {
      set('discount', 'true');
    }
  };

  return (
    <button onClick={toggle}>
      {has('discount') ? '✓' : ''} Show Discounts Only
    </button>
  );
}
```

## See Also

- Example implementation: `src/components/product/product-filters.tsx`
- Astro URL documentation: https://docs.astro.build/en/reference/api-reference/#astrourl
- Solid.js reactivity: https://www.solidjs.com/tutorial/introduction_signals
