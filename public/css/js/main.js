async function loadHomeProducts() {
    const grid = document.getElementById('product-grid');
    if (!grid) return;

    const res = await fetch('/api/products');
    const prods = await res.json();

    grid.innerHTML = prods.map(p => `
    <div class="bg-white rounded-xl shadow-sm overflow-hidden border p-4 flex flex-col justify-between">
      <img src="${p.image}" class="h-44 w-full object-cover rounded-lg mb-3">
      <div>
        <span class="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">${p.category}</span>
        <h3 class="font-bold text-gray-800 mt-2">${p.title}</h3>
        <p class="text-indigo-600 font-bold text-lg mt-1">$${p.price.toFixed(2)}</p>
      </div>
      <div class="mt-4 flex gap-2">
        <a href="product.html?id=${p.id}" class="flex-1 text-center border py-2 rounded text-sm hover:bg-gray-50">លម្អិត</a>
        <button onclick='addToCart(${JSON.stringify(p)})' class="flex-1 bg-indigo-600 text-white py-2 rounded text-sm hover:bg-indigo-700">ទិញ</button>
      </div>
    </div>
  `).join('');
}