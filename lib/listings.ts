export type District =
  | "Kinondoni"
  | "Ilala"
  | "Temeke"
  | "Ubungo"
  | "Kigamboni";

export type Listing = {
  id: string;
  title: string;
  description?: string;
  district: District;
  neighborhood: string;
  priceTzs: number;
  minMonths: number;
  luku: boolean;
  water: string;
  phone?: string | null;
  phoneMasked?: string | null;
  featured: boolean;
  imageTone: "one" | "two" | "three";
  photos?: { id: string; url: string; altText: string }[];
  bedrooms?: number;
  bathrooms?: number;
  furnished: boolean;
  allowsPets: boolean;
  allowsStudents: boolean;
  isFeatured: boolean;
  isAvailable?: boolean;
  latitude?: number | null;
  longitude?: number | null;
};

export const districts: District[] = [
  "Kinondoni",
  "Ilala",
  "Temeke",
  "Ubungo",
  "Kigamboni"
];

export const neighborhoodsByDistrict: Record<District, string[]> = {
  Kinondoni: ["Mwananyamala", "Mikocheni", "Sinza"],
  Ilala: ["Kariakoo", "Upanga", "Buguruni"],
  Temeke: ["Mbagala", "Tandika", "Chang'ombe"],
  Ubungo: ["Kimara", "Ubungo", "Makuburi"],
  Kigamboni: ["Kibada", "Kigamboni", "Mjimwema"]
};

export const demoListings: Listing[] = [
  {
    id: "demo-kin-01",
    title: "Bright room with plenty of space",
    description: "A nice room with plenty of natural light, its own prepaid electricity meter, and water available at all times.",
    district: "Kinondoni",
    neighborhood: "Mwananyamala",
    priceTzs: 120000,
    minMonths: 6,
    luku: true,
    water: "Water available",
    phone: "255712345678",
    featured: true,
    isFeatured: true,
    isAvailable: true,
    bedrooms: 1,
    bathrooms: 1,
    furnished: false,
    allowsPets: false,
    allowsStudents: true,
    imageTone: "one"
  },
  {
    id: "demo-ila-02",
    title: "Room close to public transport",
    description: "A clean room close to minibus stops and the rapid transit line in Kariakoo.",
    district: "Ilala",
    neighborhood: "Kariakoo",
    priceTzs: 160000,
    minMonths: 3,
    luku: true,
    water: "Tap water",
    phone: "255713456789",
    featured: false,
    isFeatured: false,
    isAvailable: true,
    bedrooms: 1,
    bathrooms: 1,
    furnished: false,
    allowsPets: false,
    allowsStudents: true,
    imageTone: "two"
  },
  {
    id: "demo-ubu-03",
    title: "Quiet room with shared veranda",
    description: "A room in a quiet area of Kimara, suitable for a student or a working professional.",
    district: "Ubungo",
    neighborhood: "Kimara",
    priceTzs: 100000,
    minMonths: 6,
    luku: false,
    water: "Well water",
    phone: "255714567890",
    featured: false,
    isFeatured: false,
    isAvailable: true,
    bedrooms: 1,
    bathrooms: 1,
    furnished: false,
    allowsPets: true,
    allowsStudents: true,
    imageTone: "three"
  },
  {
    id: "demo-tem-04",
    title: "New room near the road",
    description: "A well-built new room in Mbagala with tap water and good security.",
    district: "Temeke",
    neighborhood: "Mbagala",
    priceTzs: 85000,
    minMonths: 3,
    luku: true,
    water: "Tap water",
    phone: "255715678901",
    featured: false,
    isFeatured: false,
    isAvailable: true,
    bedrooms: 1,
    bathrooms: 1,
    furnished: false,
    allowsPets: false,
    allowsStudents: true,
    imageTone: "two"
  },
  {
    id: "demo-kig-05",
    title: "Room with a sea breeze",
    description: "A room with a good breeze in Kigamboni, furnished with basic furniture.",
    district: "Kigamboni",
    neighborhood: "Kigamboni",
    priceTzs: 110000,
    minMonths: 6,
    luku: true,
    water: "Water available",
    phone: "255716789012",
    featured: true,
    isFeatured: true,
    isAvailable: true,
    bedrooms: 2,
    bathrooms: 1,
    furnished: true,
    allowsPets: true,
    allowsStudents: true,
    imageTone: "three"
  }
];
