const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, index: true },
  description: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  category: { type: String, required: true, index: true },
  imageUrl: { type: String, default: '' },
  stockHint: { type: Number, default: 0 },  // Denormalized hint, source of truth is Inventory
  isActive: { type: Boolean, default: true },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Product', productSchema);
