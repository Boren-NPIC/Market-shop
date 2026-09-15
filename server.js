const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

const uploadDir = path.join(publicDir, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}
app.use('/uploads', express.static(uploadDir));

// Multer សម្រាប់ KHQR
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, 'khqr-' + Date.now() + ext);
    }
});
const upload = multer({ storage });

const DATA_FILE = path.join(__dirname, 'data.json');

function readData() {
    try {
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    } catch (e) {
        return {
            users: [{ id: 1, name: "ហាង ម៉ូដទាន់សម័យ", credits: 15, image_limit: 50, images_used: 0, khqr_image: "" }],
            products: [],
            orders: []
        };
    }
}

function writeData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Routes
app.get('/', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(publicDir, 'dashboard.html')));
app.get('/cart', (req, res) => res.sendFile(path.join(publicDir, 'cart.html')));
app.get('/checkout', (req, res) => res.sendFile(path.join(publicDir, 'checkout.html')));

// KHQR & Profile
app.post('/api/vendor/khqr', upload.single('qrImageFile'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'សូមជ្រើសរើសរូបភាព!' });
    const qrUrl = '/uploads/' + req.file.filename;
    const data = readData();
    data.users[0].khqr_image = qrUrl;
    writeData(data);
    res.json({ status: 'success', qrImage: qrUrl });
});

app.get('/api/user/profile', (req, res) => res.json(readData().users[0]));

// Vendor QR សម្រាប់ Checkout
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
    const b = req.body || {};
    if (!b.slipImage) {
        return res.status(400).json({ error: 'សូម Upload រូបភាពវិក្កយបត្របាញ់លុយ!' });
    }

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
        createdAt: new Date().toLocaleTimeString('km-KH')
    };

    data.orders.unshift(newOrder);
    writeData(data);

    res.json({ status: 'success', tranId });
});

app.get('/api/orders/check-status/:tranId', (req, res) => {
    const data = readData();
    const order = data.orders.find(o => o.tranId === req.params.tranId);
    if (!order) return res.status(404).json({ error: 'រកមិនឃើញ Order' });
    res.json({ status: order.status });
});

app.get('/api/admin/orders', (req, res) => res.json(readData().orders || []));

app.post('/api/admin/orders/confirm', (req, res) => {
    const { tranId } = req.body;
    const data = readData();
    const order = data.orders.find(o => o.tranId === tranId);
    if (order) {
        order.status = 'PAID';
        writeData(data);
    }
    res.json({ message: 'ជោគជ័យ' });
});

app.post('/api/admin/orders/clear', (req, res) => {
    const data = readData();
    data.orders = [];
    writeData(data);
    res.json({ status: 'success' });
});

// Products CRUD (គាំទ្រការកំណត់ Sizes)
app.get('/api/products', (req, res) => res.json(readData().products));

app.post('/api/products', (req, res) => {
    const data = readData();
    const user = data.users[0];
    const b = req.body || {};

    const sizes = (b.sizes || b.size || 'M, L').trim();

    const newProd = {
        id: Date.now(),
        seller_id: user.id,
        title: (b.title || 'ទំនិញថ្មី').trim(),
        category: b.category || 'clothes',
        price: parseFloat(b.price || 0),
        stock: parseInt(b.stock || 0),
        attributes: {
            size: sizes,
            ...(b.category === 'shoes' ? { shoe_size: sizes } : {})
        },
        image: b.imageBase64 || b.image || ''
    };

    data.products.unshift(newProd);
    user.images_used = (user.images_used || 0) + 1;
    writeData(data);

    res.json({ status: 'success', product: newProd });
});

app.put('/api/products/:id', (req, res) => {
    const reqId = String(req.params.id);
    const data = readData();
    const index = data.products.findIndex(p => String(p.id) === reqId);

    if (index === -1) {
        return res.status(404).json({ error: 'រកមិនឃើញទំនិញនេះទេ!' });
    }

    const currentProd = data.products[index];
    const b = req.body || {};

    const sizes = b.sizes !== undefined ? String(b.sizes).trim() : (currentProd.attributes?.size || 'M, L');

    data.products[index] = {
        ...currentProd,
        title: b.title ? b.title.trim() : currentProd.title,
        category: b.category || currentProd.category,
        price: b.price !== undefined ? parseFloat(b.price) : currentProd.price,
        stock: b.stock !== undefined ? parseInt(b.stock) : currentProd.stock,
        attributes: {
            ...currentProd.attributes,
            size: sizes,
            ...(b.category === 'shoes' ? { shoe_size: sizes } : {})
        },
        image: b.imageBase64 || currentProd.image
    };

    writeData(data);
    res.json({ status: 'success', product: data.products[index] });
});

app.delete('/api/products/:id', (req, res) => {
    const reqId = String(req.params.id);
    const data = readData();
    data.products = data.products.filter(p => String(p.id) !== reqId);
    writeData(data);
    res.json({ status: 'success' });
});

// Logo
app.post('/api/generate-logo', (req, res) => {
    const data = readData();
    const user = data.users[0];
    if (user.credits < 2) return res.status(400).json({ error: 'Credit មិនគ្រប់គ្រាន់ទេ!' });
    user.credits -= 2;
    writeData(data);
    const name = req.body.name || 'Shop';
    const logos = [
        `<svg width="140" height="90" class="border bg-black"><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="#facc15" font-weight="bold">${name}</text></svg>`,
        `<svg width="140" height="90" class="border border-indigo-500"><circle cx="70" cy="45" r="35" fill="none" stroke="#6366f1" stroke-width="2"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="#6366f1" font-size="12">${name}</text></svg>`
    ];
    res.json({ logos, remainingCredits: user.credits });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server កំពុងដំណើរការលើ http://localhost:${PORT}`));