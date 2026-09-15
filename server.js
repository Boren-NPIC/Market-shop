const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
app.use(cors());
app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ limit: '30mb', extended: true }));

const publicDir = path.join(__dirname, 'public');

const isVercel = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME;
const DATA_FILE = isVercel ? path.join('/tmp', 'data.json') : path.join(__dirname, 'data.json');

const uploadDir = isVercel ? path.join('/tmp', 'uploads') : path.join(publicDir, 'uploads');
if (!fs.existsSync(uploadDir)) {
    try { fs.mkdirSync(uploadDir, { recursive: true }); } catch (e) { }
}
app.use('/uploads', express.static(uploadDir));

if (isVercel) {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            const origPath = path.join(__dirname, 'data.json');
            if (fs.existsSync(origPath)) {
                fs.writeFileSync(DATA_FILE, fs.readFileSync(origPath, 'utf-8'));
            }
        }
    } catch (e) { }
}

let memoryDB = null;

function readData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            memoryDB = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
            if (!memoryDB.stores) memoryDB.stores = [];
            if (!memoryDB.products) memoryDB.products = [];
            if (!memoryDB.orders) memoryDB.orders = [];
            return memoryDB;
        }
    } catch (e) { }

    if (!memoryDB) {
        memoryDB = {
            stores: [],
            products: [],
            orders: []
        };
    }
    return memoryDB;
}

function writeData(data) {
    memoryDB = data;
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    } catch (e) { }
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, 'khqr-' + Date.now() + ext);
    }
});
const upload = multer({ storage });

app.use(express.static(publicDir));

// Routes
app.get('/', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(publicDir, 'dashboard.html')));
app.get('/cart', (req, res) => res.sendFile(path.join(publicDir, 'cart.html')));
app.get('/checkout', (req, res) => res.sendFile(path.join(publicDir, 'checkout.html')));

app.get('/shop/:slug', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
});

// Store Info API
app.get('/api/store/get/:slug', (req, res) => {
    const data = readData();
    const store = (data.stores || []).find(s => s.slug === req.params.slug);
    if (!store) return res.status(404).json({ error: 'រកមិនឃើញហាងនេះទេ' });
    res.json(store);
});

app.post('/api/store/create', (req, res) => {
    const { email, name, slug, logoBase64 } = req.body || {};
    if (!name || !slug || !email) {
        return res.status(400).json({ error: 'សូមបំពេញព័ត៌មានឱ្យបានគ្រប់គ្រាន់!' });
    }

    const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9-_]/g, '');
    const data = readData();

    let store = data.stores.find(s => s.slug === cleanSlug);
    if (store) {
        store.name = name.trim();
        if (logoBase64) store.logo = logoBase64;
    } else {
        store = {
            id: 'STR_' + Date.now(),
            email: email.trim(),
            name: name.trim(),
            slug: cleanSlug,
            logo: logoBase64 || '',
            khqr_image: '',
            createdAt: new Date().toISOString()
        };
        data.stores.push(store);
    }

    writeData(data);
    res.json({ status: 'success', store });
});

// KHQR Upload API
app.post('/api/vendor/khqr', upload.single('qrImageFile'), (req, res) => {
    const storeSlug = req.body.slug;
    if (!req.file) return res.status(400).json({ error: 'សូមជ្រើសរើសរូបភាព!' });
    const qrUrl = '/uploads/' + req.file.filename;

    const data = readData();
    const store = (data.stores || []).find(s => s.slug === storeSlug) || data.stores[0];
    if (store) {
        store.khqr_image = qrUrl;
        writeData(data);
    }
    res.json({ status: 'success', qrImage: qrUrl });
});

app.get('/api/checkout/vendor-qr', (req, res) => {
    const storeSlug = req.query.slug;
    const data = readData();
    const store = (data.stores || []).find(s => s.slug === storeSlug) || data.stores[0] || {};
    const qrUrl = (store.khqr_image && store.khqr_image.length > 5)
        ? store.khqr_image
        : 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=ABA-KHQR-DEMO';
    res.json({ qrImage: qrUrl, vendorName: store.name || 'ហាងអនឡាញ' });
});

// Products API (គាំទ្រ Stock)
app.get('/api/products', (req, res) => {
    const storeSlug = req.query.slug;
    const data = readData();
    let prods = data.products || [];
    if (storeSlug && storeSlug !== 'undefined' && storeSlug !== 'null') {
        const filtered = prods.filter(p => p.store_slug === storeSlug);
        if (filtered.length > 0) return res.json(filtered);
    }
    res.json(prods);
});

app.post('/api/products', (req, res) => {
    const data = readData();
    const b = req.body || {};
    const newProd = {
        id: Date.now(),
        store_slug: b.store_slug || 'default',
        title: (b.title || 'ទំនិញថ្មី').trim(),
        category: b.category || 'clothes',
        price: parseFloat(b.price || 0),
        stock: parseInt(b.stock !== undefined ? b.stock : 10), // ចំនួនស្តុកកំណត់ដោយម្ចាស់ហាង
        attributes: { size: (b.sizes || 'S, M, L').trim() },
        image: b.imageBase64 || ''
    };

    data.products.unshift(newProd);
    writeData(data);
    res.json({ status: 'success', product: newProd });
});

// កែប្រែចំនួនស្តុកទំនិញរហ័ស (Quick Update Stock)
app.put('/api/products/:id/stock', (req, res) => {
    const reqId = String(req.params.id);
    const { stock } = req.body;
    const data = readData();
    const prod = (data.products || []).find(p => String(p.id) === reqId);

    if (!prod) return res.status(404).json({ error: 'រកមិនឃើញទំនិញ' });
    prod.stock = Math.max(0, parseInt(stock || 0));
    writeData(data);

    res.json({ status: 'success', stock: prod.stock });
});

app.delete('/api/products/:id', (req, res) => {
    const reqId = String(req.params.id);
    const data = readData();
    data.products = (data.products || []).filter(p => String(p.id) !== reqId);
    writeData(data);
    res.json({ status: 'success' });
});

// Orders Management
app.post('/api/checkout/confirm-payment', (req, res) => {
    try {
        const b = req.body || {};
        if (!b.slipImage) return res.status(400).json({ error: 'សូម Upload រូបភាពវិក្កយបត្រ!' });

        const data = readData();
        const tranId = 'TX' + Date.now();

        const newOrder = {
            tranId,
            store_slug: b.store_slug || 'default',
            customerName: (b.customerName || 'អតិថិជន').trim(),
            bankAccountName: (b.bankAccountName || 'មិនបានបញ្ជាក់').trim(),
            phone: (b.phone || '-').trim(),
            deliveryMethod: (b.deliveryMethod || 'វីរៈប៊ុនថាំ (VET Express)').trim(),
            address: b.address || 'មិនមានអាសយដ្ឋាន',
            amount: parseFloat(b.amount || 0).toFixed(2),
            items: b.items || [],
            slipImage: b.slipImage,
            status: 'PENDING',
            rejectReason: '',
            createdAt: new Date().toLocaleTimeString('km-KH')
        };

        data.orders.unshift(newOrder);
        writeData(data);

        res.json({ status: 'success', tranId });
    } catch (e) {
        res.status(500).json({ error: 'Server Error' });
    }
});

app.post('/api/checkout/reupload-slip', (req, res) => {
    const { tranId, slipImage } = req.body || {};
    if (!tranId || !slipImage) return res.status(400).json({ error: 'ទិន្នន័យមិនគ្រប់គ្រាន់' });

    const data = readData();
    const order = (data.orders || []).find(o => o.tranId === tranId);
    if (!order) return res.status(404).json({ error: 'រកមិនឃើញ Order' });

    order.slipImage = slipImage;
    order.status = 'PENDING';
    order.rejectReason = '';
    writeData(data);

    res.json({ status: 'success' });
});

app.get('/api/orders/check-status/:tranId', (req, res) => {
    const data = readData();
    const order = (data.orders || []).find(o => o.tranId === req.params.tranId);
    if (!order) return res.status(404).json({ error: 'រកមិនឃើញ Order' });
    res.json({ status: order.status, rejectReason: order.rejectReason || '' });
});

app.get('/api/admin/orders', (req, res) => {
    const storeSlug = req.query.slug;
    const data = readData();
    let orders = data.orders || [];

    if (storeSlug && storeSlug !== 'default' && storeSlug !== 'undefined') {
        const storeOrders = orders.filter(o => o.store_slug === storeSlug);
        if (storeOrders.length > 0) return res.json(storeOrders);
    }
    res.json(orders);
});

// នៅពេលយល់ព្រមទទួលប្រាក់ កាត់ស្តុកទំនិញស្វ័យប្រវត្តិ
app.post('/api/admin/orders/confirm', (req, res) => {
    const { tranId } = req.body;
    const data = readData();
    const order = (data.orders || []).find(o => o.tranId === tranId);
    if (order) {
        order.status = 'PAID';

        // កាត់ស្តុកទំនិញដែលបានលក់
        if (order.items && order.items.length) {
            order.items.forEach(it => {
                const prod = (data.products || []).find(p => String(p.id) === String(it.id));
                if (prod && prod.stock !== undefined) {
                    prod.stock = Math.max(0, prod.stock - (it.qty || 1));
                }
            });
        }
        writeData(data);
    }
    res.json({ message: 'ជោគជ័យ' });
});

app.post('/api/admin/orders/reject', (req, res) => {
    const { tranId, reason } = req.body;
    const data = readData();
    const order = (data.orders || []).find(o => o.tranId === tranId);
    if (order) {
        order.status = 'REJECTED';
        order.rejectReason = reason || 'វិក្កយបត្រមិនត្រឹមត្រូវ';
        writeData(data);
    }
    res.json({ message: 'បានបដិសេធ' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server កំពុងដំណើរការលើ http://localhost:${PORT}`));

module.exports = app;