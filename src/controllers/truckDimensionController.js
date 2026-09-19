import TruckDimension from '../models/TruckDimension.js';

export const DEFAULT_TRUCK_SPECS = [
  {
    truckKey: 'van',
    name: '1-Bedroom Van / 2-3 Tonne',
    sizeInTon: '2 - 3 Tonne',
    tonnageNumber: 2.5,
    capacity: '10 – 14 Cubic Metres',
    dimensions: '3200 L × 1800 W × 1800 H (mm) / 3.2m L × 1.8m W × 1.8m H',
    length: '3.2 Metres',
    height: '1.8 Metres',
    width: '1.8 Metres',
    heightClearance: '2.6 Metres',
    parkingClearance: '5.5 Metres Long (approx. 1.5 car spaces)',
    tailgateCapacity: 'Ramp Access / 300 kg',
    roomCapacity: '1 Bedroom Apartment, Studio or Single Items',
    boxCapacity: '50 – 80 Moving Boxes + Core Furniture',
    badge: 'Compact & Fast',
    imageUrl: '/uploads/email-assets/delivery_plus_truck_3d.jpg',
    features: ['1-2 Professional Movers', 'Transit Blankets', 'Trolleys', 'Fast City Transit'],
    isActive: true,
    displayOrder: 1,
  },
  {
    truckKey: '4.5',
    name: '4.5 Tonne Truck',
    sizeInTon: '4.5 Tonne',
    tonnageNumber: 4.5,
    capacity: '19 Cubic Metres (approx.)',
    dimensions: '4200 L × 2050 W × 2200 H (mm) / 4.2m L × 2.05m W × 2.2m H',
    length: '4.2 Metres',
    height: '2.2 Metres',
    width: '2.05 Metres',
    heightClearance: '3.2 Metres',
    parkingClearance: '7 Metres Long (approx. 2 car parking spaces)',
    tailgateCapacity: '500 kg Hydraulic Tailgate / Ramp',
    roomCapacity: 'Studio Apartment, 1-Bedroom, 2-Bedroom Apartment or 2-Bedroom House',
    boxCapacity: '100 – 140 Moving Boxes + Core Furniture',
    badge: 'Most Popular',
    imageUrl: '/uploads/email-assets/delivery_plus_truck_3d.jpg',
    features: ['2 Professional Movers', '500kg Hydraulic Tailgate', 'Protective Blankets', 'Tie-Down Straps & Trolleys'],
    isActive: true,
    displayOrder: 2,
  },
  {
    truckKey: '6.5',
    name: '6.5 Tonne Truck',
    sizeInTon: '6.5 Tonne',
    tonnageNumber: 6.5,
    capacity: '29 Cubic Metres (approx.)',
    dimensions: '5000 L × 2490 W × 2400 H (mm) / 5.0m L × 2.49m W × 2.4m H',
    length: '5.0 Metres',
    height: '2.4 Metres',
    width: '2.49 Metres',
    heightClearance: '3.5 Metres',
    parkingClearance: '8.5 Metres Long (approx. 2.5 car spaces)',
    tailgateCapacity: '750 kg Hydraulic Tailgate',
    roomCapacity: '2-3 Bedroom Apartment, 2-3 Bedroom House',
    boxCapacity: '180 – 240 Moving Boxes + Full Household Furniture',
    badge: 'Family Home Choice',
    imageUrl: '/uploads/email-assets/delivery_plus_truck_3d.jpg',
    features: ['2 Professional Movers', '750kg Hydraulic Tailgate', 'Heavy-Duty Straps', 'Full Home Protection & Dollies'],
    isActive: true,
    displayOrder: 3,
  },
  {
    truckKey: '8',
    name: '8 Tonne Truck',
    sizeInTon: '8 Tonne',
    tonnageNumber: 8,
    capacity: '38 Cubic Metres (approx.)',
    dimensions: '6400 L × 2400 W × 2500 H (mm) / 6.4m L × 2.4m W × 2.5m H',
    length: '6.4 Metres',
    height: '2.5 Metres',
    width: '2.4 Metres',
    heightClearance: '3.7 Metres',
    parkingClearance: '10 Metres Long (approx. 3 car spaces)',
    tailgateCapacity: '1000 kg Heavy-Duty Tailgate',
    roomCapacity: '3-4 Bedroom House, 4-Bedroom Apartment or 5-Bedroom House',
    boxCapacity: '250 – 320 Moving Boxes + Heavy Appliances',
    badge: 'Large Capacity',
    imageUrl: '/uploads/email-assets/delivery_plus_truck_3d.jpg',
    features: ['2 Professional Movers', '1000kg Tailgate Lifter', 'Commercial Grade Blankets', 'Heavy Appliances Protection'],
    isActive: true,
    displayOrder: 4,
  },
  {
    truckKey: '10',
    name: '10 - 12 Tonne Truck',
    sizeInTon: '10 – 12 Tonne',
    tonnageNumber: 10,
    capacity: '45 – 50 Cubic Metres',
    dimensions: '7800 L × 2400 W × 2600 H (mm) / 7.8m L × 2.4m W × 2.6m H',
    length: '7.8 Metres',
    height: '2.6 Metres',
    width: '2.4 Metres',
    heightClearance: '3.8 Metres',
    parkingClearance: '12 Metres Long (approx. 3-4 car spaces)',
    tailgateCapacity: '1200 kg Heavy Duty Tailgate',
    roomCapacity: '4-5+ Bedroom Large Home or Commercial Relocation',
    boxCapacity: '320 – 400 Moving Boxes + Commercial Cargo',
    badge: 'Commercial & Estate',
    imageUrl: '/uploads/email-assets/delivery_plus_truck_3d.jpg',
    features: ['2-3 Professional Movers', '1200kg Heavy Cargo Lift', 'Commercial Grade Protection', 'Massive Cargo Capacity'],
    isActive: true,
    displayOrder: 5,
  },
  {
    truckKey: '14',
    name: '14 - 16 Tonne Semi / Interstate Truck',
    sizeInTon: '14 – 16 Tonne',
    tonnageNumber: 14,
    capacity: '55 – 65 Cubic Metres',
    dimensions: '9000 L × 2400 W × 2700 H (mm) / 9.0m L × 2.4m W × 2.7m H',
    length: '9.0 Metres',
    height: '2.7 Metres',
    width: '2.4 Metres',
    heightClearance: '3.9 Metres',
    parkingClearance: '15 Metres Long (approx. 4-5 car spaces)',
    tailgateCapacity: '1500 kg Heavy Duty Tailgate',
    roomCapacity: 'Multi-Storey Estate, Warehouse or Interstate Relocation',
    boxCapacity: '400+ Moving Boxes + Industrial Scope',
    badge: 'Max Fleet Power',
    imageUrl: '/uploads/email-assets/delivery_plus_truck_3d.jpg',
    features: ['3-4 Professional Movers', '1500kg Heavy Cargo Lift', 'Long-Haul Straps', 'Full Transit Insurance Ready'],
    isActive: true,
    displayOrder: 6,
  },
];

// Helper to auto-seed if collection is empty
export const seedTruckDimensionsIfEmpty = async () => {
  try {
    const count = await TruckDimension.countDocuments();
    if (count === 0) {
      await TruckDimension.insertMany(DEFAULT_TRUCK_SPECS);
      console.log('Seeded default Truck Dimensions into database');
    }
  } catch (err) {
    console.error('Error auto-seeding Truck Dimensions:', err);
  }
};

// GET /api/truck-dimensions
export const getAllTruckDimensions = async (req, res, next) => {
  try {
    await seedTruckDimensionsIfEmpty();
    const query = req.query.all === 'true' ? {} : { isActive: true };
    const items = await TruckDimension.find(query).sort({ displayOrder: 1, tonnageNumber: 1 });
    res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
};

// GET /api/truck-dimensions/:idOrKey
export const getTruckDimension = async (req, res, next) => {
  try {
    const { idOrKey } = req.params;
    let item = await TruckDimension.findById(idOrKey);
    if (!item) {
      item = await TruckDimension.findOne({ truckKey: idOrKey.toLowerCase() });
    }
    if (!item) {
      return res.status(404).json({ success: false, message: 'Truck specification not found' });
    }
    res.json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
};

// POST /api/truck-dimensions
export const createTruckDimension = async (req, res, next) => {
  try {
    const payload = req.body;
    if (!payload.truckKey) {
      payload.truckKey = String(payload.sizeInTon || payload.name || Date.now())
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-');
    }
    const item = await TruckDimension.create(payload);
    res.status(201).json({ success: true, data: item, message: 'Truck specification created successfully' });
  } catch (err) {
    next(err);
  }
};

// PUT /api/truck-dimensions/:id
export const updateTruckDimension = async (req, res, next) => {
  try {
    const { id } = req.params;
    const item = await TruckDimension.findByIdAndUpdate(id, req.body, { new: true, runValidators: true });
    if (!item) {
      return res.status(404).json({ success: false, message: 'Truck specification not found' });
    }
    res.json({ success: true, data: item, message: 'Truck specification updated successfully' });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/truck-dimensions/:id
export const deleteTruckDimension = async (req, res, next) => {
  try {
    const { id } = req.params;
    const item = await TruckDimension.findByIdAndDelete(id);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Truck specification not found' });
    }
    res.json({ success: true, message: 'Truck specification deleted successfully' });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/truck-dimensions/:id/toggle
export const toggleTruckDimensionStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const item = await TruckDimension.findById(id);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Truck specification not found' });
    }
    item.isActive = !item.isActive;
    await item.save();
    res.json({ success: true, data: item, message: `Truck specification ${item.isActive ? 'activated' : 'deactivated'}` });
  } catch (err) {
    next(err);
  }
};

// POST /api/truck-dimensions/upload-image
export const uploadTruckImage = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image file uploaded' });
    }
    const imageUrl = `/uploads/${req.file.filename}`;
    res.json({
      success: true,
      imageUrl,
      data: { imageUrl },
      message: 'Image uploaded successfully',
    });
  } catch (err) {
    next(err);
  }
};

