import {
  Car,
  Plane,
  Utensils,
  ShoppingBag,
  Zap,
  Heart,
  Film,
  Gift,
  GraduationCap,
  Briefcase,
  CreditCard,
  type LucideIcon,
} from "lucide-react"

export interface ExpenseCategory {
  id: string
  name: string
  icon: LucideIcon
  color: string
  keywords: string[]
  subcategories?: string[]
}

export const expenseCategories: ExpenseCategory[] = [
  // Transportation
  {
    id: "transportation",
    name: "Transportation",
    icon: Car,
    color: "text-blue-500",
    keywords: [
      "uber",
      "lyft",
      "taxi",
      "cab",
      "bus",
      "train",
      "metro",
      "subway",
      "flight",
      "airline",
      "car",
      "gas",
      "fuel",
      "parking",
      "toll",
      "bike",
      "scooter",
      "transport",
      "travel",
      "commute",
      "ride",
    ],
    subcategories: ["Rideshare", "Public Transit", "Flight", "Gas", "Parking"],
  },

  // Food & Dining
  {
    id: "food",
    name: "Food & Dining",
    icon: Utensils,
    color: "text-orange-500",
    keywords: [
      "restaurant",
      "food",
      "lunch",
      "dinner",
      "breakfast",
      "coffee",
      "cafe",
      "bar",
      "pub",
      "pizza",
      "burger",
      "sushi",
      "groceries",
      "grocery",
      "supermarket",
      "market",
      "snack",
      "drink",
      "beverage",
      "meal",
      "dining",
      "takeout",
      "delivery",
      "doordash",
      "ubereats",
      "grubhub",
    ],
    subcategories: ["Restaurants", "Groceries", "Coffee", "Delivery", "Alcohol"],
  },

  // Shopping
  {
    id: "shopping",
    name: "Shopping",
    icon: ShoppingBag,
    color: "text-purple-500",
    keywords: [
      "shopping",
      "clothes",
      "clothing",
      "shoes",
      "electronics",
      "amazon",
      "store",
      "mall",
      "purchase",
      "buy",
      "retail",
      "online",
      "ebay",
      "target",
      "walmart",
      "costco",
      "books",
      "furniture",
      "home",
      "decor",
    ],
    subcategories: ["Clothing", "Electronics", "Home & Garden", "Books", "Online"],
  },

  // Utilities
  {
    id: "utilities",
    name: "Utilities",
    icon: Zap,
    color: "text-yellow-500",
    keywords: [
      "electricity",
      "electric",
      "power",
      "water",
      "gas",
      "internet",
      "wifi",
      "phone",
      "mobile",
      "cable",
      "utility",
      "bill",
      "rent",
      "mortgage",
      "insurance",
      "heating",
      "cooling",
    ],
    subcategories: ["Electricity", "Water", "Internet", "Phone", "Rent"],
  },

  // Travel & Accommodation
  {
    id: "travel",
    name: "Travel",
    icon: Plane,
    color: "text-cyan-500",
    keywords: [
      "hotel",
      "accommodation",
      "airbnb",
      "vacation",
      "trip",
      "travel",
      "flight",
      "booking",
      "resort",
      "hostel",
      "motel",
      "lodge",
      "cruise",
      "tour",
      "sightseeing",
      "visa",
      "passport",
    ],
    subcategories: ["Hotels", "Flights", "Activities", "Visa/Documents"],
  },

  // Entertainment
  {
    id: "entertainment",
    name: "Entertainment",
    icon: Film,
    color: "text-pink-500",
    keywords: [
      "movie",
      "cinema",
      "theater",
      "concert",
      "show",
      "game",
      "gaming",
      "party",
      "club",
      "entertainment",
      "fun",
      "activity",
      "sport",
      "gym",
      "fitness",
      "netflix",
      "spotify",
      "subscription",
      "streaming",
    ],
    subcategories: ["Movies", "Concerts", "Gaming", "Sports", "Subscriptions"],
  },

  // Healthcare
  {
    id: "healthcare",
    name: "Healthcare",
    icon: Heart,
    color: "text-red-500",
    keywords: [
      "doctor",
      "hospital",
      "medical",
      "medicine",
      "pharmacy",
      "health",
      "dental",
      "dentist",
      "clinic",
      "checkup",
      "prescription",
      "treatment",
      "therapy",
      "surgery",
      "emergency",
    ],
    subcategories: ["Doctor Visits", "Medications", "Dental", "Emergency"],
  },

  // Gifts & Donations
  {
    id: "gifts",
    name: "Gifts",
    icon: Gift,
    color: "text-indigo-500",
    keywords: [
      "gift",
      "present",
      "birthday",
      "anniversary",
      "wedding",
      "christmas",
      "holiday",
      "donation",
      "charity",
      "tip",
      "gratuity",
      "surprise",
    ],
    subcategories: ["Birthday", "Holiday", "Wedding", "Donations"],
  },

  // Education
  {
    id: "education",
    name: "Education",
    icon: GraduationCap,
    color: "text-green-600",
    keywords: [
      "school",
      "education",
      "tuition",
      "course",
      "class",
      "book",
      "textbook",
      "supplies",
      "university",
      "college",
      "training",
      "workshop",
      "seminar",
      "certification",
    ],
    subcategories: ["Tuition", "Books", "Supplies", "Online Courses"],
  },

  // Business
  {
    id: "business",
    name: "Business",
    icon: Briefcase,
    color: "text-gray-600",
    keywords: [
      "business",
      "work",
      "office",
      "meeting",
      "conference",
      "supplies",
      "equipment",
      "software",
      "service",
      "professional",
      "consulting",
      "freelance",
    ],
    subcategories: ["Office Supplies", "Software", "Consulting", "Equipment"],
  },
]

export class ExpenseCategorizer {
  private categories: ExpenseCategory[]

  constructor() {
    this.categories = expenseCategories
  }

  /**
   * Categorize an expense based on its description
   */
  categorizeExpense(description: string): ExpenseCategory {
    const normalizedDescription = description.toLowerCase().trim()

    // Find the best matching category
    for (const category of this.categories) {
      for (const keyword of category.keywords) {
        if (normalizedDescription.includes(keyword.toLowerCase())) {
          return category
        }
      }
    }

    // Default category if no match found
    return {
      id: "other",
      name: "Other",
      icon: CreditCard,
      color: "text-gray-500",
      keywords: [],
    }
  }

  /**
   * Get category by ID
   */
  getCategoryById(id: string): ExpenseCategory | undefined {
    return this.categories.find((cat) => cat.id === id)
  }

  /**
   * Get all categories
   */
  getAllCategories(): ExpenseCategory[] {
    return this.categories
  }

  /**
   * Get category suggestions based on partial description
   */
  getSuggestions(partialDescription: string, limit = 3): ExpenseCategory[] {
    const normalizedInput = partialDescription.toLowerCase().trim()

    if (normalizedInput.length < 2) {
      return []
    }

    const matches = this.categories.filter((category) =>
      category.keywords.some((keyword) => keyword.toLowerCase().includes(normalizedInput)),
    )

    return matches.slice(0, limit)
  }

  /**
   * Analyze spending patterns by category
   */
  analyzeSpending(expenses: Array<{ description: string; amount: number; date: string }>) {
    const categoryTotals = new Map<string, { total: number; count: number; category: ExpenseCategory }>()

    expenses.forEach((expense) => {
      const category = this.categorizeExpense(expense.description)
      const existing = categoryTotals.get(category.id) || { total: 0, count: 0, category }

      categoryTotals.set(category.id, {
        total: existing.total + expense.amount,
        count: existing.count + 1,
        category,
      })
    })

    return Array.from(categoryTotals.values()).sort((a, b) => b.total - a.total)
  }
}

// Export a singleton instance
export const expenseCategorizer = new ExpenseCategorizer()

// Utility function to get category icon component
export const getCategoryIcon = (categoryId: string): LucideIcon => {
  const category = expenseCategorizer.getCategoryById(categoryId)
  return category?.icon || CreditCard
}

// Utility function to get category color
export const getCategoryColor = (categoryId: string): string => {
  const category = expenseCategorizer.getCategoryById(categoryId)
  return category?.color || "text-gray-500"
}
