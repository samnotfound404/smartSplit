// Cash flow minimization algorithm converted from the C code
// This implements the heap-based algorithm for optimizing debt settlements

interface User {
  id: string
  name: string
  balance: number
}

interface Settlement {
  from: string
  to: string
  amount: number
  from_name: string
  to_name: string
}

// Heap node structure
interface HeapNode {
  balance: number
  index: number
}

// Max heap for creditors
class MaxHeap {
  nodes: HeapNode[] = []
  size = 0

  insert(balance: number, index: number) {
    this.nodes[this.size] = { balance, index }
    this.heapifyUp(this.size)
    this.size++
  }

  extractMax(): HeapNode {
    const maxNode = this.nodes[0]
    this.nodes[0] = this.nodes[--this.size]
    this.heapifyDown(0)
    return maxNode
  }

  heapifyUp(idx: number) {
    while (idx > 0 && this.nodes[Math.floor((idx - 1) / 2)].balance < this.nodes[idx].balance) {
      const temp = this.nodes[idx]
      this.nodes[idx] = this.nodes[Math.floor((idx - 1) / 2)]
      this.nodes[Math.floor((idx - 1) / 2)] = temp
      idx = Math.floor((idx - 1) / 2)
    }
  }

  heapifyDown(idx: number) {
    let largest = idx
    const left = 2 * idx + 1
    const right = 2 * idx + 2

    if (left < this.size && this.nodes[left].balance > this.nodes[largest].balance) {
      largest = left
    }
    if (right < this.size && this.nodes[right].balance > this.nodes[largest].balance) {
      largest = right
    }
    if (largest !== idx) {
      const temp = this.nodes[idx]
      this.nodes[idx] = this.nodes[largest]
      this.nodes[largest] = temp
      this.heapifyDown(largest)
    }
  }
}

// Min heap for debtors
class MinHeap {
  nodes: HeapNode[] = []
  size = 0

  insert(balance: number, index: number) {
    this.nodes[this.size] = { balance, index }
    this.heapifyUp(this.size)
    this.size++
  }

  extractMin(): HeapNode {
    const minNode = this.nodes[0]
    this.nodes[0] = this.nodes[--this.size]
    this.heapifyDown(0)
    return minNode
  }

  heapifyUp(idx: number) {
    while (idx > 0 && this.nodes[Math.floor((idx - 1) / 2)].balance > this.nodes[idx].balance) {
      const temp = this.nodes[idx]
      this.nodes[idx] = this.nodes[Math.floor((idx - 1) / 2)]
      this.nodes[Math.floor((idx - 1) / 2)] = temp
      idx = Math.floor((idx - 1) / 2)
    }
  }

  heapifyDown(idx: number) {
    let smallest = idx
    const left = 2 * idx + 1
    const right = 2 * idx + 2

    if (left < this.size && this.nodes[left].balance < this.nodes[smallest].balance) {
      smallest = left
    }
    if (right < this.size && this.nodes[right].balance < this.nodes[smallest].balance) {
      smallest = right
    }
    if (smallest !== idx) {
      const temp = this.nodes[idx]
      this.nodes[idx] = this.nodes[smallest]
      this.nodes[smallest] = temp
      this.heapifyDown(smallest)
    }
  }
}

// Main cash flow minimization function
export function minimizeCashFlow(users: User[]): Settlement[] {
  const EPSILON = 0.01 // Small value to handle floating point comparison
  const settlements: Settlement[] = []
  const creditors = new MaxHeap()
  const debtors = new MinHeap()

  // Separate creditors and debtors
  users.forEach((user, i) => {
    if (Math.abs(user.balance) > EPSILON) {
      if (user.balance > 0) {
        creditors.insert(user.balance, i)
      } else {
        debtors.insert(-user.balance, i) // Store positive value for simplicity
      }
    }
  })

  // Process settlements
  while (creditors.size > 0 && debtors.size > 0) {
    const maxCreditor = creditors.extractMax()
    const maxDebtor = debtors.extractMin()

    const creditor = users[maxCreditor.index]
    const debtor = users[maxDebtor.index]

    // Calculate settlement amount
    const settlementAmount = Math.min(maxCreditor.balance, maxDebtor.balance)

    // Round to 2 decimal places to avoid floating point issues
    const roundedAmount = Math.round(settlementAmount * 100) / 100

    // Add settlement
    settlements.push({
      from: debtor.id,
      to: creditor.id,
      amount: roundedAmount,
      from_name: debtor.name,
      to_name: creditor.name,
    })

    // Update balances
    const creditorRemaining = maxCreditor.balance - roundedAmount
    const debtorRemaining = maxDebtor.balance - roundedAmount

    // Re-insert if there's remaining balance
    if (creditorRemaining > EPSILON) {
      creditors.insert(creditorRemaining, maxCreditor.index)
    }

    if (debtorRemaining > EPSILON) {
      debtors.insert(debtorRemaining, maxDebtor.index)
    }
  }

  return settlements
}
