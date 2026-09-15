const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));

const publicDir = path.join(__dirname, 'public');

const ADMIN_SECRET_KEY = "mysecret8888";

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
            return memoryDB;
        }
    } catch (e) { }

    if (!memoryDB) {
        memoryDB = {
            users: [{ id: 1, name: "KM-Market", logo: "", owner_email: "", credits: 15, khqr_image: "" }],
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

app.use(express.static(publicDir, { index: false }));

// Public Routes
app.get('/', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));
app.get('/cart', (req, res) => res.sendFile(path.join(publicDir, 'cart.html')));
app.get('/checkout', (req, res) => res.sendFile(path.join(publicDir, 'checkout.html')));

app.get(['/dashboard', '/dashboard.html'], (req, res) => res.redirect('/'));

app.get('/admin', (req, res) => {
    if (req.query.key === ADMIN_SECRET_KEY) {
        return res.sendFile(path.join(publicDir, 'dashboard.html'));
    }
    res.redirect('/');
});

function requireAdminKey(req, res, next) {
    const authKey = req.headers['x-admin-key'] || req.query.key;
    if (authKey === ADMIN_SECRET_KEY) return next();
    res.status(403).json({ error: 'គ្មានសិទ្ធិ' });
}

// -------------------------------------------------------------
// SETUP STORE PROFILE (ឈ្មោះហាង, Logo, Email)
// -------------------------------------------------------------
app.get('/api/store/info', (req, res) => {
    const data = readData();
    const store = data.users[0] || {};
    res.json({
        name: store.name || 'KM-Market',
        logo: store.logo || '',
        isConfigured: !!store.owner_email
    });
});

app.post('/api/store/setup', (req, res) => {
    const { name, logoBase64, email } = req.body || {};
    if (!name || !email) {
        return res.status(400).json({ error: 'សូមបំពេញឈ្មោះហាង និង Email!' });
    }

    const data = readData();
    data.users[0].name = name.trim();
    data.users[0].owner_email = email.trim();
    if (logoBase64) {
        data.users[0].logo = logoBase64;
    }
    writeData(data);

    res.json({ status: 'success', store: data.users[0] });
});

// KHQR & Vendor
app.post('/api/vendor/khqr', upload.single('qrImageFile'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'សូមជ្រើសរើសរូបភាព!' });
    const qrUrl = '/uploads/' + req.file.filename;
    const data = readData();
    data.users[0].khqr_image = qrUrl;
    writeData(data);
    res.json({ status: 'success', qrImage: qrUrl });
});

app.get('/api/user/profile', (req, res) => res.json(readData().users[0]));

app.get('/api/checkout/vendor-qr', (req, res) => {
    const data = readData();
    const vendor = data.users[0];
    const qrUrl = (vendor.khqr_image && vendor.khqr_image.length > 5)
        ? vendor.khqr_image
        : 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=ABA-KHQR-DEMO';
    res.json({ qrImage: qrUrl, vendorName: vendor.name });
});

// Orders Management
app.post('/api/checkout/confirm-payment', (req, res) => {
    try {
        const b = req.body || {};
        if (!b.slipImage) return res.status(400).json({ error: 'សូម Upload រូបភាពវិក្កយបត្របាញ់លុយ!' });

        const data = readData();
        const tranId = 'TX' + Date.now();

        const newOrder = {
            tranId,
            customerName: (b.customerName || 'អតិថិជន').trim(),
            bankAccountName: (b.bankAccountName || 'មិនបានបញ្ជាក់').trim(),
            phone: (b.phone || '-').trim(),
            deliveryMethod: (b.deliveryMethod || 'វីរៈប៊ុនថាំ (VET Express)').trim(),
            address: (b.address && String(b.address).trim() !== '') ? String(b.address).trim() : 'មិនមានអាសយដ្ឋាន',
            amount: parseFloat(b.amount || 0).toFixed(2),
            items: b.items || [],
            slipImage: b.slipImage,
            status: 'PENDING',
            rejectReason: '',
            createdAt: new Date().toLocaleTimeString('km-KH')
        };

        if (!data.orders) data.orders = [];
        data.orders.unshift(newOrder);
        writeData(data);

        res.json({ status: 'success', tranId });
    } catch (err) {
        res.status(500).json({ error: 'កំហុស Server' });
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

// Admin Orders
app.get('/api/admin/orders', requireAdminKey, (req, res) => res.json(readData().orders || []));

app.post('/api/admin/orders/confirm', requireAdminKey, (req, res) => {
    const { tranId } = req.body;
    const data = readData();
    const order = (data.orders || []).find(o => o.tranId === tranId);
    if (order) {
        order.status = 'PAID';
        writeData(data);
    }
    res.json({ message: 'ជោគជ័យ' });
});

app.post('/api/admin/orders/reject', requireAdminKey, (req, res) => {
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

app.post('/api/admin/orders/clear', requireAdminKey, (req, res) => {
    const data = readData();
    data.orders = [];
    writeData(data);
    res.json({ status: 'success' });
});

// Products CRUD
app.get('/api/products', (req, res) => res.json(readData().products || []));

app.post('/api/products', requireAdminKey, (req, res) => {
    const data = readData();
    const user = data.users[0];
    const b = req.body || {};
    const sizes = (b.sizes || b.size || 'S, M, L, XL').trim();

    const newProd = {
        id: Date.now(),
        seller_id: user.id,
        title: (b.title || 'ទំនិញថ្មី').trim(),
        category: b.category || 'clothes',
        price: parseFloat(b.price || 0),
        stock: parseInt(b.stock || 0),
        attributes: { size: sizes },
        image: b.imageBase64 || b.image || ''
    };

    if (!data.products) data.products = [];
    data.products.unshift(newProd);
    writeData(data);
    res.json({ status: 'success', product: newProd });
});

app.put('/api/products/:id', requireAdminKey, (req, res) => {
    const reqId = String(req.params.id);
    const data = readData();
    const index = (data.products || []).findIndex(p => String(p.id) === reqId);

    if (index === -1) return res.status(404).json({ error: 'រកមិនឃើញទំនិញ' });

    const currentProd = data.products[index];
    const b = req.body || {};
    const sizes = b.sizes !== undefined ? String(b.sizes).trim() : (currentProd.attributes?.size || 'S, M, L');

    data.products[index] = {
        ...currentProd,
        title: b.title ? b.title.trim() : currentProd.title,
        category: b.category || currentProd.category,
        price: b.price !== undefined ? parseFloat(b.price) : currentProd.price,
        stock: b.stock !== undefined ? parseInt(b.stock) : currentProd.stock,
        attributes: { size: sizes },
        image: b.imageBase64 || currentProd.image
    };

    writeData(data);
    res.json({ status: 'success', product: data.products[index] });
});

app.delete('/api/products/:id', requireAdminKey, (req, res) => {
    const reqId = String(req.params.id);
    const data = readData();
    data.products = (data.products || []).filter(p => String(p.id) !== reqId);
    writeData(data);
    res.json({ status: 'success' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server កំពុងដំណើរការលើ http://localhost:${PORT}`));

module.exports = app;