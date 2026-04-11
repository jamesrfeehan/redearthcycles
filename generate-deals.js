#!/usr/bin/env node
/**
 * BTI Closeout CSV → Static product pages generator
 * Reads the daily BTI closeout CSV, filters for profitable items,
 * and generates deals.html (listing) + individual product pages.
 *
 * Usage: node generate-deals.js sales_closeout_full_2026_04_11.csv
 */

const fs = require('fs');
const path = require('path');

// --- Config ---
const MIN_MARGIN_PCT = 20;      // minimum discount % to include
const MIN_MSRP = 25;            // minimum MSRP to bother listing
const FOCUS_CATEGORIES = null;  // null = all categories, or set an array to filter
const SELL_DISCOUNT_FROM_MSRP = 0.10; // sell at 10% below MSRP
const SHIPPING_FEE = 9.95;
const RESHIP_COST = 6.00;

// --- Parse CSV ---
function parseCSV(text) {
  const lines = text.split('\n').filter(l => l.trim());
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map(line => {
    const vals = parseCSVLine(line);
    const row = {};
    headers.forEach((h, i) => row[h.trim()] = (vals[i] || '').trim());
    return row;
  });
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// --- Process items ---
function processItems(rows) {
  return rows.map(r => {
    const msrp = parseFloat(r['REGULAR PRICE']) || 0;
    const cost = parseFloat(r['DISCOUNT PRICE']) || 0;
    const qty = parseInt(r['AVAILABLE QUANTITY']) || 0;
    const discPct = parseFloat(r['DISCOUNT %']) || 0;
    const sellPrice = Math.round(msrp * (1 - SELL_DISCOUNT_FROM_MSRP) * 100) / 100;
    const margin = Math.round((sellPrice - cost) * 100) / 100;
    const marginPct = msrp > 0 ? Math.round((margin / sellPrice) * 100) : 0;
    const slug = slugify(r['BTI ITEM NUMBER'] + '-' + r['ITEM NAME']);

    return {
      btiId: r['BTI ITEM NUMBER'],
      vendorPart: r['VENDOR PART NUMBER'],
      category: r['CATEGORY NAME'],
      productLine: r['PRODUCT LINE NAME'],
      manufacturer: r['MANUFACTURER NAME'],
      name: r['ITEM NAME'].replace(/\s+(NLS|NLA)$/, ''),
      isNLA: r['ITEM NAME'].includes('NLA'),
      isNLS: r['ITEM NAME'].includes('NLS'),
      qty,
      saleEnd: r['SALE END DATE'],
      msrp,
      cost,
      discPct,
      sellPrice,
      margin,
      marginPct,
      shippingProfit: SHIPPING_FEE - RESHIP_COST,
      totalProfit: Math.round((margin + SHIPPING_FEE - RESHIP_COST) * 100) / 100,
      slug,
    };
  })
  .filter(item =>
    item.discPct >= MIN_MARGIN_PCT &&
    item.msrp >= MIN_MSRP &&
    item.qty > 0 &&
    item.margin > 0
  )
  .sort((a, b) => b.margin - a.margin);
}

function slugify(str) {
  return str.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 80);
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// --- Generate listing page ---
function generateListingPage(items) {
  const categories = [...new Set(items.map(i => i.category))].sort();
  const manufacturers = [...new Set(items.map(i => i.manufacturer))].sort();

  const categoryButtons = categories.map(c =>
    `<button class="filter-btn" data-category="${escapeHtml(c)}">${escapeHtml(c)}</button>`
  ).join('\n            ');

  const productCards = items.map(item => `
          <div class="deal-card" data-category="${escapeHtml(item.category)}" data-manufacturer="${escapeHtml(item.manufacturer)}">
            ${item.isNLA ? '<span class="badge badge-nla">Last Chance</span>' : ''}
            ${item.discPct >= 40 ? '<span class="badge badge-hot">Hot Deal</span>' : ''}
            <div class="deal-brand">${escapeHtml(item.manufacturer)}</div>
            <h3 class="deal-name"><a href="deals/${item.slug}.html">${escapeHtml(item.name)}</a></h3>
            <div class="deal-category">${escapeHtml(item.category)} &middot; ${escapeHtml(item.productLine)}</div>
            <div class="deal-pricing">
              <span class="deal-price">$${item.sellPrice.toFixed(2)}</span>
              <span class="deal-msrp">MSRP $${item.msrp.toFixed(2)}</span>
              <span class="deal-savings">Save ${Math.round((1 - item.sellPrice / item.msrp) * 100)}%</span>
            </div>
            <div class="deal-stock">${item.qty <= 3 ? `Only ${item.qty} left` : `${item.qty} available`}</div>
            <a href="mailto:James@RedEarthCycles.com?subject=Order: ${encodeURIComponent(item.name)}&body=I'd like to order: ${encodeURIComponent(item.name)} (${item.btiId}) - $${item.sellPrice.toFixed(2)}" class="btn btn-small">Contact to Order</a>
          </div>`).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Closeout Deals | Red Earth Cycles | Boulder, CO</title>
  <meta name="description" content="Closeout deals on bike parts from top brands. Expert-curated selection from Red Earth Cycles in Boulder, CO.">
  <meta property="og:title" content="Closeout Deals | Red Earth Cycles">
  <meta property="og:description" content="Closeout deals on bike parts from top brands at Red Earth Cycles.">
  <meta property="og:url" content="https://redearthcycles.com/deals.html">
  <meta property="og:type" content="website">
  <link rel="canonical" href="https://redearthcycles.com/deals.html">
  <link rel="stylesheet" href="style.css">
  <link rel="stylesheet" href="deals.css">
</head>
<body>

  <header class="header">
    <div class="container">
      <a href="index.html" class="logo">Red Earth Cycles</a>
      <nav class="nav">
        <button class="nav-toggle" aria-label="Toggle menu">&#9776;</button>
        <ul class="nav-links">
          <li><a href="index.html#services">Services</a></li>
          <li><a href="index.html#pricing">Pricing</a></li>
          <li><a href="deals.html" class="active">Deals</a></li>
          <li><a href="index.html#about">About</a></li>
          <li><a href="index.html#contact">Contact</a></li>
        </ul>
      </nav>
    </div>
  </header>

  <section class="hero hero-small">
    <div class="hero-content">
      <h1>Closeout Deals</h1>
      <p>Expert-curated closeout parts at below-retail prices. Limited quantities.</p>
    </div>
  </section>

  <section class="section">
    <div class="container">
      <div class="deals-toolbar">
        <div class="deals-count"><strong>${items.length}</strong> deals available</div>
        <div class="deals-filters">
          <button class="filter-btn active" data-category="all">All</button>
          ${categoryButtons}
        </div>
        <div class="deals-sort">
          <label>Sort by:
            <select id="sort-select">
              <option value="savings">Biggest Savings</option>
              <option value="price-low">Price: Low to High</option>
              <option value="price-high">Price: High to Low</option>
              <option value="brand">Brand</option>
            </select>
          </label>
        </div>
      </div>

      <div class="deals-grid" id="deals-grid">
        ${productCards}
      </div>
    </div>
  </section>

  <footer class="footer">
    <div class="container">
      <p>&copy; 2026 Red Earth Cycles. All rights reserved.</p>
    </div>
  </footer>

  <script>
    // Nav toggle
    document.querySelector('.nav-toggle').addEventListener('click', function() {
      document.querySelector('.nav-links').classList.toggle('open');
    });

    // Category filter
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        const cat = this.dataset.category;
        document.querySelectorAll('.deal-card').forEach(card => {
          card.style.display = (cat === 'all' || card.dataset.category === cat) ? '' : 'none';
        });
      });
    });

    // Sort
    document.getElementById('sort-select').addEventListener('change', function() {
      const grid = document.getElementById('deals-grid');
      const cards = [...grid.querySelectorAll('.deal-card')];
      cards.sort((a, b) => {
        const getPrice = el => parseFloat(el.querySelector('.deal-price').textContent.replace('$',''));
        const getSavings = el => parseFloat(el.querySelector('.deal-savings').textContent.replace(/[^0-9]/g,''));
        const getBrand = el => el.querySelector('.deal-brand').textContent;
        switch(this.value) {
          case 'price-low': return getPrice(a) - getPrice(b);
          case 'price-high': return getPrice(b) - getPrice(a);
          case 'savings': return getSavings(b) - getSavings(a);
          case 'brand': return getBrand(a).localeCompare(getBrand(b));
        }
      });
      cards.forEach(c => grid.appendChild(c));
    });
  </script>

</body>
</html>`;
}

// --- Generate individual product page ---
function generateProductPage(item) {
  const schemaData = {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": item.name,
    "brand": { "@type": "Brand", "name": item.manufacturer },
    "category": item.category,
    "sku": item.btiId,
    "mpn": item.vendorPart,
    "offers": {
      "@type": "Offer",
      "price": item.sellPrice.toFixed(2),
      "priceCurrency": "USD",
      "availability": item.qty > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      "seller": {
        "@type": "LocalBusiness",
        "name": "Red Earth Cycles"
      }
    }
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(item.name)} | Red Earth Cycles</title>
  <meta name="description" content="${escapeHtml(item.name)} by ${escapeHtml(item.manufacturer)}. Save ${Math.round((1 - item.sellPrice / item.msrp) * 100)}% off MSRP. Closeout deal from Red Earth Cycles, Boulder, CO.">
  <meta property="og:title" content="${escapeHtml(item.name)} | Red Earth Cycles">
  <meta property="og:description" content="Save ${Math.round((1 - item.sellPrice / item.msrp) * 100)}% on ${escapeHtml(item.name)} by ${escapeHtml(item.manufacturer)}">
  <meta property="og:url" content="https://redearthcycles.com/deals/${item.slug}.html">
  <meta property="og:type" content="product">
  <link rel="canonical" href="https://redearthcycles.com/deals/${item.slug}.html">
  <link rel="stylesheet" href="../style.css">
  <link rel="stylesheet" href="../deals.css">
  <script type="application/ld+json">${JSON.stringify(schemaData)}</script>
</head>
<body>

  <header class="header">
    <div class="container">
      <a href="../index.html" class="logo">Red Earth Cycles</a>
      <nav class="nav">
        <button class="nav-toggle" aria-label="Toggle menu">&#9776;</button>
        <ul class="nav-links">
          <li><a href="../index.html#services">Services</a></li>
          <li><a href="../index.html#pricing">Pricing</a></li>
          <li><a href="../deals.html" class="active">Deals</a></li>
          <li><a href="../index.html#about">About</a></li>
          <li><a href="../index.html#contact">Contact</a></li>
        </ul>
      </nav>
    </div>
  </header>

  <section class="section">
    <div class="container">
      <a href="../deals.html" class="back-link">&larr; Back to Deals</a>

      <div class="product-detail">
        <div class="product-info">
          <div class="product-brand">${escapeHtml(item.manufacturer)}</div>
          <h1 class="product-title">${escapeHtml(item.name)}</h1>
          <div class="product-meta">
            <span>${escapeHtml(item.category)}</span>
            <span>&middot;</span>
            <span>${escapeHtml(item.productLine)}</span>
          </div>

          <div class="product-pricing-block">
            <div class="product-price">$${item.sellPrice.toFixed(2)}</div>
            <div class="product-msrp">MSRP: <s>$${item.msrp.toFixed(2)}</s></div>
            <div class="product-save">You save $${(item.msrp - item.sellPrice).toFixed(2)} (${Math.round((1 - item.sellPrice / item.msrp) * 100)}%)</div>
          </div>

          ${item.isNLA ? '<div class="product-badge badge-nla">Discontinued &mdash; Last Chance</div>' : ''}
          ${item.isNLS ? '<div class="product-badge badge-nls">Closeout &mdash; While Supplies Last</div>' : ''}

          <div class="product-stock">${item.qty <= 3 ? `Only ${item.qty} left` : `${item.qty} available`}</div>

          <div class="product-details">
            <table>
              <tr><td>Part Number</td><td>${escapeHtml(item.vendorPart)}</td></tr>
              <tr><td>Brand</td><td>${escapeHtml(item.manufacturer)}</td></tr>
              <tr><td>Category</td><td>${escapeHtml(item.category)}</td></tr>
              <tr><td>Shipping</td><td>$${SHIPPING_FEE.toFixed(2)} flat rate</td></tr>
            </table>
          </div>

          <a href="mailto:James@RedEarthCycles.com?subject=Order: ${encodeURIComponent(item.name)}&body=I'd like to order:%0A%0A${encodeURIComponent(item.name)}%0ASKU: ${item.btiId}%0APrice: $${item.sellPrice.toFixed(2)}%0A%0APlease let me know next steps." class="btn">Contact to Order</a>

          <p class="product-note">Orders are fulfilled within 3-5 business days. Contact us for questions about compatibility.</p>
        </div>
      </div>
    </div>
  </section>

  <footer class="footer">
    <div class="container">
      <p>&copy; 2026 Red Earth Cycles. All rights reserved.</p>
    </div>
  </footer>

  <script>
    document.querySelector('.nav-toggle').addEventListener('click', function() {
      document.querySelector('.nav-links').classList.toggle('open');
    });
  </script>

</body>
</html>`;
}

// --- Main ---
const csvFile = process.argv[2];
if (!csvFile) {
  console.error('Usage: node generate-deals.js <csv-file>');
  process.exit(1);
}

const csvText = fs.readFileSync(csvFile, 'utf-8');
const rows = parseCSV(csvText);
const items = processItems(rows);

console.log(`Parsed ${rows.length} rows, ${items.length} profitable items after filtering`);

// Create deals directory
const dealsDir = path.join(__dirname, 'deals');
if (fs.existsSync(dealsDir)) {
  fs.rmSync(dealsDir, { recursive: true });
}
fs.mkdirSync(dealsDir, { recursive: true });

// Generate listing page
fs.writeFileSync(path.join(__dirname, 'deals.html'), generateListingPage(items));
console.log('Generated deals.html');

// Generate individual product pages
items.forEach(item => {
  fs.writeFileSync(path.join(dealsDir, `${item.slug}.html`), generateProductPage(item));
});
console.log(`Generated ${items.length} product pages in deals/`);

// Summary
const totalPotentialProfit = items.reduce((sum, i) => sum + i.totalProfit, 0);
const categories = [...new Set(items.map(i => i.category))];
console.log(`\nSummary:`);
console.log(`  Categories: ${categories.length}`);
console.log(`  Avg margin: $${(items.reduce((s, i) => s + i.margin, 0) / items.length).toFixed(2)}`);
console.log(`  Total potential profit (if all sold): $${totalPotentialProfit.toFixed(2)}`);
