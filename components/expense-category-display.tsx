import { expenseCategorizer } from "@/lib/expense-categorizer"
import { Badge } from "@/components/ui/badge"

interface ExpenseCategoryDisplayProps {
  description: string
  showBadge?: boolean
  className?: string
}

export function ExpenseCategoryDisplay({ description, showBadge = true, className = "" }: ExpenseCategoryDisplayProps) {
  const category = expenseCategorizer.categorizeExpense(description)
  const IconComponent = category.icon

  if (!showBadge) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <IconComponent className={`h-4 w-4 ${category.color}`} />
        <span className="text-sm text-gray-600">{category.name}</span>
      </div>
    )
  }

  return (
    <Badge variant="secondary" className={`flex items-center gap-1.5 ${className}`}>
      <IconComponent className={`h-3 w-3 ${category.color}`} />
      {category.name}
    </Badge>
  )
}

interface CategoryStatsProps {
  expenses: Array<{ description: string; amount: number; date: string }>
  className?: string
}

export function CategoryStats({ expenses, className = "" }: CategoryStatsProps) {
  const analysis = expenseCategorizer.analyzeSpending(expenses)

  return (
    <div className={`space-y-3 ${className}`}>
      {analysis.map(({ category, total, count }) => {
        const IconComponent = category.icon
        const percentage = (total / analysis.reduce((sum, item) => sum + item.total, 0)) * 100

        return (
          <div key={category.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-white">
                <IconComponent className={`h-4 w-4 ${category.color}`} />
              </div>
              <div>
                <p className="font-medium text-gray-900">{category.name}</p>
                <p className="text-sm text-gray-500">{count} expenses</p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-bold text-gray-900">${total.toFixed(2)}</p>
              <p className="text-sm text-gray-500">{percentage.toFixed(1)}%</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
