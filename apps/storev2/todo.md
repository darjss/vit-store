# Store Frontend (apps/storev2) - TODO

## 🔐 Authentication & User Management

### Login/Signup Flow
- [x] Create `/pages/login.astro` page
- [x] Build OTP input component with phone number field
- [x] Add OTP verification component (4-digit code input)
- [x] Implement "resend OTP" functionality with countdown timer
- [x] Add loading states for OTP sending and verification
- [x] Display error messages for invalid OTP or phone number

### User Profile & Account
- [x] Create `/pages/profile.astro` - user profile page
- [x] Build user info display component (name, phone, address)
- [ ] Add editable profile form (name, email, address fields)
- [ ] Implement profile update functionality
- [ ] Add password/phone change feature

### Order History
- [x] Create order history page (integrated in `/pages/profile.astro`)
- [x] Build order list component with status badges
- [ ] Add order filtering (all, pending, shipped, delivered, cancelled)
- [x] Create order details display (in profile page)
  - [x] Display order items with images
  - [ ] Show order status timeline
  - [ ] Display payment information
  - [x] Show shipping address
  - [ ] Add order tracking information
- [ ] Implement "reorder" functionality
- [ ] Add "cancel order" option for pending orders
- [ ] Create order search functionality

### Session Management
- [x] Add session check on protected pages
- [ ] Implement auto-logout on session expiry
- [ ] Add "remember me" functionality
- [ ] Create session timeout warning modal
- [x] Implement logout functionality across all pages

---

## 🛍️ Shopping Experience

### Product Listing Page (`/products/index.astro`)
- [ ] Replace placeholder content with actual product grid
- [x] Implement product filtering system (component exists: `product-filters.tsx`)
  - [x] Filter by category
  - [x] Filter by brand
  - [x] Filter by price range
  - [ ] Filter by featured/new/discounted
  - [ ] Filter by stock availability
- [ ] Add sorting options
  - [ ] Sort by price (low to high, high to low)
  - [ ] Sort by name (A-Z, Z-A)
  - [ ] Sort by newest first
  - [ ] Sort by popularity
- [ ] Create pagination component
- [ ] Add "view mode" toggle (grid/list view)
- [ ] Implement "load more" button
- [ ] Add product count display ("Showing X of Y products")
- [x] Create "clear all filters" button

### Search Functionality
- [ ] Create search page `/pages/search.astro`
- [ ] Build search input component with autocomplete
- [ ] Implement real-time search suggestions
- [ ] Add search history (recent searches)
- [ ] Create search results page with filtering
- [ ] Add "no results" state with suggestions
- [ ] Implement search by product name, description, brand
- [ ] Add keyboard navigation for search suggestions

### Product Details Enhancements
- [x] Product details page with tabs (description, usage, ingredients, specs)
- [ ] Add product reviews section
  - [ ] Display existing reviews with ratings
  - [ ] Add review form (rating, title, comment)
  - [ ] Implement review pagination
  - [ ] Add helpful/not helpful votes
  - [ ] Filter reviews by rating
- [ ] Create product availability indicator
- [ ] Add "notify when available" for out-of-stock items
- [ ] Implement product comparison feature
- [ ] Add social sharing buttons
- [x] Create "recently viewed products" section (recommended products)
- [ ] Add product Q&A section
- [ ] Implement wishlist/favorite functionality

---

## 🛒 Cart & Checkout

### Cart Enhancements
- [ ] Add "save for later" functionality
- [ ] Implement promo code input field
- [ ] Create discount code validation
- [ ] Add estimated delivery date
- [x] Implement "continue shopping" link (link to products in empty cart)
- [ ] Add cart expiry warning for items
- [ ] Create mini cart dropdown in header
- [ ] Add cart item notes/special instructions

### Checkout Page (`/checkout.astro`)
- [x] Build complete checkout page layout
- [ ] Create multi-step checkout flow
  - [x] Step 1: Shipping information
    - [x] Shipping address form
    - [ ] Address selection from saved addresses
    - [ ] Add new address option
  - [ ] Step 2: Delivery options
    - [ ] Standard delivery option
    - [ ] Express delivery option
    - [ ] Pickup option
    - [ ] Delivery date selection
  - [ ] Step 3: Payment method
    - [ ] QPay integration component
    - [ ] Social Pay integration
    - [ ] Cash on delivery option
    - [ ] Card payment option (if available)
  - [x] Step 4: Order review
    - [x] Review all order details
    - [ ] Edit buttons for each section
    - [ ] Terms and conditions checkbox
    - [x] Final "Place Order" button
- [x] Add order summary sidebar (sticky on desktop)
- [x] Implement form validation for all steps
- [ ] Add progress indicator for checkout steps
- [ ] Create "back to previous step" functionality
- [ ] Implement order confirmation page
- [ ] Add order success animation/illustration
- [ ] Send order confirmation email (if email available)

---

## 📄 Static Pages

### About Page
- [ ] Create `/pages/about.astro`
- [ ] Add company story section
- [ ] Create team section with photos
- [ ] Add mission and values section
- [ ] Include trust badges and certifications

### Contact Page
- [ ] Create `/pages/contact.astro`
- [ ] Build contact form (name, email, phone, message)
- [ ] Add contact information (phone, email, address)
- [ ] Implement form submission with email notification
- [ ] Add success/error messages
- [ ] Include map with location (if applicable)
- [ ] Add social media links

### Help/FAQ Page
- [ ] Create `/pages/help.astro`
- [ ] Add frequently asked questions accordion
- [ ] Create category-based FAQ organization
- [ ] Add search functionality for FAQs
- [ ] Include shipping policy
- [ ] Add return/refund policy
- [ ] Create privacy policy section
- [ ] Add terms of service

### 404 Page
- [x] Create custom `/pages/404.astro`
- [x] Add helpful error message
- [ ] Include search functionality
- [x] Add links to popular pages
- [x] Create illustration for 404 state

---

## 🎨 UI Components & Features

### Header Enhancements
- [x] Implement mobile menu functionality (hamburger icon exists, needs functionality)
- [ ] Add search functionality to header search button
- [x] Create user dropdown menu
  - [x] Profile link
  - [x] Logout button
- [ ] Add wishlist icon to header
- [x] Implement sticky header on scroll
- [ ] Add announcement bar above header
- [ ] Create mega menu for categories (desktop)

### Footer Enhancements
- [ ] Add newsletter signup form
- [ ] Include social media icons and links
- [ ] Add payment method icons
- [x] Create site map in footer (basic links exist)
- [ ] Add customer service hours
- [ ] Include trust badges

### Category Navigation
- [ ] Create category page `/pages/categories/[slug].astro`
- [x] Build category carousel/slider on homepage (CategoryGrid component)
- [ ] Add category images to CategoryGrid component
- [x] Implement category filtering on products page (filter component exists)
- [x] Create breadcrumb navigation for categories (exists on product detail page)

### Wishlist/Favorites
- [ ] Create wishlist store (similar to cart)
- [ ] Add "add to wishlist" button on product cards
- [ ] Create `/pages/wishlist.astro` page
- [ ] Build wishlist page layout
- [ ] Add "move to cart" functionality
- [ ] Implement "remove from wishlist" option
- [ ] Show wishlist count in header

### Product Comparison
- [ ] Create comparison store
- [ ] Add "compare" checkbox on product cards
- [ ] Create `/pages/compare.astro` page
- [ ] Build comparison table component
- [ ] Add remove from comparison functionality
- [ ] Limit comparison to 4 products maximum

---

## 📱 Responsive & Mobile

### Mobile Optimization
- [x] Test and fix mobile menu navigation (MobileNavbar component exists)
- [x] Optimize product cards for mobile (responsive design exists)
- [x] Improve checkout flow for mobile (responsive layout exists)
- [x] Add touch-friendly UI elements (buttons and interactions exist)
- [x] Test cart interactions on mobile (cart page is responsive)
- [x] Optimize image loading for mobile (@unpic/solid used for images)
- [ ] Implement mobile-specific filters layout

### PWA Features
- [ ] Add "Add to Home Screen" prompt
- [ ] Implement offline support
- [ ] Add service worker for caching
- [ ] Create offline page
- [ ] Enable push notifications for order updates
- [ ] Add app-like animations and transitions

---

## 🔔 Notifications & Feedback

### Toast Notifications
- [x] Install and configure toast library
- [ ] Add toast for "added to cart" success
- [ ] Show toast for "added to wishlist"
- [x] Display toast for errors (network, validation)
- [ ] Add toast for session timeout warnings
- [ ] Show toast for successful profile updates
- [x] Display toast for order placement success

### Loading States
- [x] Add skeleton loaders for product cards (fallback slots exist)
- [ ] Create loading spinner for cart operations
- [x] Add loading state for checkout steps
- [x] Implement page transition animations (Astro transitions)
- [ ] Add loading overlay for long operations

### Error Handling
- [ ] Create error boundary component
- [ ] Add error states for failed API calls
- [ ] Implement retry functionality for failed requests
- [ ] Add fallback UI for missing images
- [ ] Create network error detection and display

---

## 🔍 SEO & Performance

### SEO Optimization
- [ ] Add meta tags to all pages
- [ ] Implement Open Graph tags for social sharing
- [ ] Create XML sitemap
- [ ] Add structured data (Schema.org) for products
- [ ] Optimize page titles and descriptions
- [ ] Add canonical URLs
- [ ] Implement breadcrumb schema
- [ ] Add product schema markup

### Performance Optimization
- [ ] Implement lazy loading for images
- [ ] Optimize image formats (WebP, AVIF)
- [ ] Add image compression pipeline
- [ ] Implement code splitting
- [ ] Optimize bundle size
- [ ] Add route preloading for common paths
- [ ] Implement virtual scrolling for long lists
- [ ] Optimize font loading

---

## 🧪 Testing & Quality

### Testing Setup
- [ ] Set up testing framework (Vitest)
- [ ] Add unit tests for utility functions
- [ ] Create component tests for critical components
- [ ] Add integration tests for cart functionality
- [ ] Test checkout flow end-to-end
- [ ] Add accessibility tests
- [ ] Test responsive breakpoints

### Code Quality
- [ ] Add ESLint configuration
- [ ] Set up Prettier for code formatting
- [ ] Add pre-commit hooks (Husky)
- [ ] Implement TypeScript strict mode
- [ ] Add JSDoc comments to components
- [ ] Create component documentation

---

## 🌐 Internationalization (i18n)

### Mongolian Language Support
- [ ] Audit all hardcoded text for proper Mongolian
- [ ] Create translation JSON files
- [ ] Implement language switching functionality
- [ ] Add English as secondary language option
- [ ] Format currency properly (₮)
- [ ] Format dates in Mongolian locale
- [ ] Test RTL support (if needed)

---

## 📊 Analytics & Tracking

### Analytics Integration
- [ ] Set up Google Analytics 4
- [ ] Track product views
- [ ] Track add to cart events
- [ ] Track checkout steps
- [ ] Track order completion
- [ ] Track search queries
- [ ] Add conversion tracking
- [ ] Implement event tracking for key actions

### User Behavior
- [ ] Track most viewed products
- [ ] Monitor cart abandonment
- [ ] Track user navigation patterns
- [ ] Measure page load times
- [ ] Track error occurrences

---

## 🔒 Security & Privacy

### Security Enhancements
- [ ] Implement CSRF protection
- [ ] Add rate limiting for API calls
- [ ] Sanitize user inputs
- [ ] Implement Content Security Policy
- [ ] Add XSS protection
- [ ] Secure session storage
- [ ] Implement secure headers

### Privacy Features
- [ ] Add cookie consent banner
- [ ] Create privacy policy page
- [ ] Implement GDPR compliance features
- [ ] Add data deletion request option
- [ ] Create terms of service page

---

## 🎁 Marketing Features

### Promotions
- [ ] Create banner component for promotions
- [ ] Add countdown timer for limited offers
- [ ] Implement flash sale functionality
- [ ] Add "deal of the day" section
- [ ] Create promotional email templates

### Loyalty Program
- [ ] Design loyalty points system
- [ ] Add points display in user account
- [ ] Create rewards redemption flow
- [ ] Show points earned on orders

### Referral Program
- [ ] Create referral code generation
- [ ] Add referral link sharing
- [ ] Implement referral tracking
- [ ] Add referral rewards system

---

## 🐛 Bug Fixes & Improvements

### Known Issues
- [ ] Fix cart persistence issues (if any)
- [ ] Resolve image carousel navigation on mobile
- [ ] Fix product filter reset behavior
- [ ] Improve search autocomplete performance
- [ ] Fix mobile menu z-index issues

### UI/UX Improvements
- [ ] Improve button hover states
- [ ] Enhance form validation messages
- [ ] Add micro-interactions
- [ ] Improve loading states
- [ ] Enhance empty states
- [ ] Add better error messages
- [ ] Improve accessibility (ARIA labels)
- [ ] Add keyboard navigation support

---

## 🚀 Deployment & DevOps

### Deployment Preparation
- [ ] Set up environment variables for production
- [ ] Configure Cloudflare Pages deployment
- [ ] Set up staging environment
- [ ] Add health check endpoint
- [ ] Configure error monitoring (Sentry)
- [ ] Set up logging system
- [ ] Add performance monitoring

### CI/CD Pipeline
- [ ] Set up GitHub Actions workflow
- [ ] Add automated testing in CI
- [ ] Implement automatic deployment to staging
- [ ] Add manual approval for production deployment
- [ ] Configure deployment notifications

---

## 📈 Future Enhancements

### Advanced Features
- [ ] Implement product recommendations AI
- [ ] Add voice search functionality
- [ ] Create AR product preview (if applicable)
- [ ] Add subscription/recurring orders
- [ ] Implement gift card functionality
- [ ] Add product bundles and packages
- [ ] Create affiliate program
- [ ] Add live chat support

### Admin Features
- [ ] Create inventory alerts
- [ ] Add low stock notifications
- [ ] Implement bulk order processing
- [ ] Add customer segmentation
- [ ] Create marketing automation

---

## Priority Levels

🔴 **Critical** (Complete these first)
- [x] Checkout page implementation
- [ ] Product listing page (placeholder exists, needs actual product grid)
- [x] User authentication pages
- [ ] Search functionality

🟡 **High Priority** (Complete next)
- [x] User profile and order history
- [ ] Wishlist functionality
- [x] Mobile responsiveness (basic responsive design implemented)
- [ ] SEO optimization

🟢 **Medium Priority** (Nice to have)
- Product reviews
- Comparison feature
- PWA features
- Advanced analytics

🔵 **Low Priority** (Future enhancements)
- Referral program
- Loyalty system
- Advanced AI features
- Subscription orders
