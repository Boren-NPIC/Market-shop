const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Database In-Memory
let stores = {};
let products = [];
let orders = [];

// -------------------------------------------------------------
// SYSTEM RESET / PURGE ROUTE
// -------------------------------------------------------------
app.get('/api/admin/reset-system-purge', (req, res) => {
    stores = {};
    products = [];
    orders = [];
    console.log("🧹 [SYSTEM PURGE]: បានសម្អាតទិន្នន័យចាស់ទាំងអស់ចេញពី Server រួចរាល់!");
    res.send(`
        <!DOCTYPE html>
        <html lang="km">
        <head>
            <meta charset="UTF-8">
            <title>សម្អាតប្រព័ន្ធជោគជ័យ</title>
            <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="bg-slate-900 text-white min-h-screen flex items-center justify-center p-4">
            <div class="bg-slate-800 p-8 rounded-3xl border border-slate-700 text-center max-w-md shadow-2xl">
                <div class="text-4xl mb-3">🧹</div>
                <h2 class="text-xl font-bold text-emerald-400 mb-2">សម្អាតទិន្នន័យចាស់ជោគជ័យ!</h2>
                <p class="text-xs text-slate-400 mb-4">រាល់ឈ្មោះហាង Logo និងស្តុកចាស់ៗត្រូវបានលុបស្អាត ១០០%។</p>
                <div class="text-[11px] text-slate-500">កំពុងនាំត្រឡប់ទៅទំព័រដើម...</div>
            </div>
            <script>
                try {
                    localStorage.clear();
                    sessionStorage.clear();
                } catch(e) {}
                setTimeout(function() {
                    window.location.href = '/';
                }, 1200);
            </script>
        </body>
        </html>
    `);
});

// -------------------------------------------------------------
// STORE APIS
// -------------------------------------------------------------
app.post('/api/store/create', (req, res) => {
    const { email, name, slug, logoBase64 } = req.body;
    if (!name || !slug) {
        return res.status(400).json({ error: 'សូមបំពេញឈ្មោះហាង និង Link ហាងឱ្យបានត្រឹមត្រូវ!' });
    }

    const cleanSlug = slug.toLowerCase().trim().replace(/[^a-z0-9-]/g, '');

    stores[cleanSlug] = {
        email: email || 'anonymous',
        name: name.trim(),
        slug: cleanSlug,
        logo: logoBase64 || '',
        khqr: '',
        createdAt: new Date()
    };

    console.log(`✓ ហាងថ្មីត្រូវបានបង្កើត៖ ${name} (/shop/${cleanSlug})`);
    return res.json({ success: true, store: stores[cleanSlug] });
});

app.get('/api/store/get/:slug', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const { slug } = req.params;
    const store = stores[slug];
    if (!store) {
        return res.status(404).json({ error: 'រកមិនឃើញហាងនេះឡើយ' });
    }
    return res.json(store);
});

app.post('/api/vendor/khqr', (req, res) => {
    const { slug, khqrBase64 } = req.body;
    if (stores[slug]) {
        stores[slug].khqr = khqrBase64;
        return res.json({ success: true });
    }
    return res.status(404).json({ error: 'រកមិនឃើញហាងឡើយ' });
});

// -------------------------------------------------------------
// PRODUCT APIS
// -------------------------------------------------------------
app.get('/api/products', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const { slug } = req.query;
    if (slug && slug !== 'all' && slug !== 'undefined') {
        return res.json(products.filter(p => p.store_slug === slug));
    }
    return res.json(products);
});

app.post('/api/products', (req, res) => {
    const { store_slug, title, category, price, stock, sizes, promotion, promo, imageBase64 } = req.body;
    if (!store_slug || !title || !price) {
        return res.status(400).json({ error: 'សូមបំពេញព័ត៌មានផលិតផលឱ្យគ្រប់គ្រាន់!' });
    }

    const promoValue = promotion || promo || '';

    const newProd = {
        id: 'PRD_' + Date.now(),
        store_slug,
        title: title.trim(),
        category: category || 'clothes',
        price: parseFloat(price) || 0,
        stock: parseInt(stock) || 0,
        promotion: promoValue ? promoValue.trim() : '',
        attributes: { size: sizes || 'S, M, L' },
        image: imageBase64 || '',
        createdAt: new Date()
    };

    products.unshift(newProd);
    return res.json({ success: true, product: newProd });
});

app.put('/api/products/:id', (req, res) => {
    const { id } = req.params;
    const { title, category, price, stock, sizes, promotion, promo, imageBase64 } = req.body;

    const prod = products.find(p => p.id === id);
    if (!prod) {
        return res.status(404).json({ error: 'រកមិនឃើញទំនិញឡើយ' });
    }

    if (title) prod.title = title.trim();
    if (category) prod.category = category;
    if (price !== undefined) prod.price = parseFloat(price) || 0;
    if (stock !== undefined) prod.stock = parseInt(stock) || 0;
    if (sizes) prod.attributes = { size: sizes };

    const promoUpdate = promotion !== undefined ? promotion : promo;
    if (promoUpdate !== undefined) {
        prod.promotion = promoUpdate ? promoUpdate.trim() : '';
    }

    if (imageBase64) prod.image = imageBase64;
    return res.json({ success: true, product: prod });
});

app.put('/api/products/:id/stock', (req, res) => {
    const { id } = req.params;
    const { stock } = req.body;
    const prod = products.find(p => p.id === id);
    if (prod) {
        prod.stock = parseInt(stock) || 0;
        return res.json({ success: true, stock: prod.stock });
    }
    return res.status(404).json({ error: 'រកមិនឃើញទំនិញ' });
});

app.delete('/api/products/:id', (req, res) => {
    const { id } = req.params;
    products = products.filter(p => p.id !== id);
    return res.json({ success: true });
});

// -------------------------------------------------------------
// ORDER APIS (LIVE STATUS & INVOICE)
// -------------------------------------------------------------
app.get('/api/admin/orders', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const { slug } = req.query;
    if (slug) {
        return res.json(orders.filter(o => o.store_slug === slug));
    }
    return res.json(orders);
});

app.get('/api/admin/orders/history', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const { slug } = req.query;
    if (slug) {
        return res.json(orders.filter(o => o.store_slug === slug));
    }
    return res.json(orders);
});

app.post('/api/admin/orders/clear-completed', (req, res) => {
    const { slug } = req.body;
    let clearedCount = 0;
    orders.forEach(o => {
        if (o.store_slug === slug && (o.status === 'PAID' || o.status === 'REJECTED')) {
            o.archived = true;
            clearedCount++;
        }
    });
    return res.json({ success: true, clearedCount });
});

app.post('/api/checkout/confirm-payment', (req, res) => {
    const { store_slug, customerName, phone, address, deliveryMethod, items, slipImage, amount } = req.body;

    const newOrder = {
        tranId: 'TX' + Date.now(),
        store_slug: store_slug || 'default',
        customerName: customerName || 'អតិថិជន',
        phone: phone || '',
        address: address || '',
        deliveryMethod: deliveryMethod || 'វីរៈប៊ុនថាំ',
        items: items || [],
        slipImage: slipImage || '',
        amount: amount || '0.00',
        status: 'PENDING',
        archived: false,
        rejectReason: '',
        createdAt: new Date()
    };

    orders.unshift(newOrder);
    console.log(`📥 ទទួលបានការបញ្ជាទិញថ្មី៖ ${newOrder.tranId}`);
    return res.json({ success: true, tranId: newOrder.tranId });
});

// API ពិនិត្យមើលស្ថានភាព Order & វិក្កយបត្រ (No Cache)
app.get('/api/orders/:tranId', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const { tranId } = req.params;
    const order = orders.find(o => String(o.tranId) === String(tranId));
    if (!order) {
        return res.status(404).json({ error: 'រកមិនឃើញវិក្កយបត្រឡើយ' });
    }
    const store = stores[order.store_slug] || { name: 'SMD Market', logo: '' };
    return res.json({ success: true, order, store });
});

// ម្ចាស់ហាងយល់ព្រមទទួលប្រាក់
app.post('/api/admin/orders/confirm', (req, res) => {
    const { tranId } = req.body;
    const order = orders.find(o => String(o.tranId) === String(tranId));
    if (order) {
        order.status = 'PAID';
        if (order.items && order.items.length) {
            order.items.forEach(it => {
                const p = products.find(prod => prod.id === it.id);
                if (p) p.stock = Math.max(0, p.stock - (it.qty || 1));
            });
        }
        console.log(`✅ [CONFIRMED]: ម្ចាស់ហាងបានយល់ព្រម Order ${tranId} -> ប្រែជា PAID`);
        return res.json({ success: true, order });
    }
    return res.status(404).json({ error: 'រកមិនឃើញ Order' });
});

// ម្ចាស់ហាងបដិសេធ
app.post('/api/admin/orders/reject', (req, res) => {
    const { tranId, reason } = req.body;
    const order = orders.find(o => String(o.tranId) === String(tranId));
    if (order) {
        order.status = 'REJECTED';
        order.rejectReason = reason || 'ការទូទាត់ប្រាក់មិនត្រឹមត្រូវ';
        console.log(`❌ [REJECTED]: ម្ចាស់ហាងបានបដិសេធ Order ${tranId}`);
        return res.json({ success: true, order });
    }
    return res.status(404).json({ error: 'រកមិនឃើញ Order ឡើយ' });
});

// Routes Frontend
app.get('/shop/:slug', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Server កំពុងដំណើរការលើ http://localhost:${PORT}`);
});