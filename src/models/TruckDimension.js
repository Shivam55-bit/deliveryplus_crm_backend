import mongoose from 'mongoose';

const truckDimensionSchema = new mongoose.Schema(
  {
    truckKey: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    sizeInTon: {
      type: String,
      required: true,
      trim: true,
    },
    tonnageNumber: {
      type: Number,
      default: 4.5,
    },
    capacity: {
      type: String,
      required: true,
      trim: true,
    },
    dimensions: {
      type: String,
      required: true,
      trim: true,
    },
    length: {
      type: String,
      default: '',
      trim: true,
    },
    height: {
      type: String,
      default: '',
      trim: true,
    },
    width: {
      type: String,
      default: '',
      trim: true,
    },
    heightClearance: {
      type: String,
      required: true,
      trim: true,
    },
    parkingClearance: {
      type: String,
      required: true,
      trim: true,
    },
    tailgateCapacity: {
      type: String,
      required: true,
      trim: true,
    },
    roomCapacity: {
      type: String,
      required: true,
      trim: true,
    },
    boxCapacity: {
      type: String,
      default: '',
      trim: true,
    },
    badge: {
      type: String,
      default: 'Popular',
      trim: true,
    },
    imageUrl: {
      type: String,
      default: '/uploads/email-assets/delivery_plus_truck_3d.jpg',
      trim: true,
    },
    features: {
      type: [String],
      default: [
        'Transit Blankets & Tie-Down Straps',
        'Heavy-Duty Moving Trolleys',
        'Hydraulic Tailgate / Ramp Access',
        'Professional Goods Protection'
      ],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    displayOrder: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('TruckDimension', truckDimensionSchema);
