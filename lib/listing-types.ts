export type ListingPhotoData = {
  id: string;
  url: string;
  altText: string;
};

export type ListingReviewData = {
  id: string;
  userName: string;
  rating: number;
  comment: string;
  createdAt: string;
};

export type ListingDetailData = {
  id: string;
  title: string;
  description: string;
  district: string;
  neighborhood: string;
  priceTzs: number;
  minMonths: number;
  luku: boolean;
  water: string;
  phone: null;
  phoneMasked: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  furnished: boolean;
  allowsPets: boolean;
  allowsStudents: boolean;
  electricityMode: "INDEPENDENT" | "SHARED";
  hasWifi: boolean;
  toiletMode: "PRIVATE" | "SHARED";
  isFeatured: boolean;
  featured: boolean;
  imageTone: "one" | "two" | "three";
  isAvailable: boolean;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
  ownerId: string;
  dalali: {
    id: string;
    name: string;
    isVerified: boolean;
    memberSince: string;
  };
  photos: ListingPhotoData[];
  reviews: ListingReviewData[];
  ratingAverage: number | null;
  reviewCount: number;
};
