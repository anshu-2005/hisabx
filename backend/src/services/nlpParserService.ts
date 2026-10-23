export interface ParsedTransactionPreview {
  success: boolean;
  rawInput: string;
  proposedType: 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'MONEY_LENT' | 'MONEY_BORROWED';
  proposedAmount: number;
  proposedCategory: string;
  proposedAccountKeyword: string;
  proposedPerson?: string;
  description: string;
  confidence: number;
}

export class SmartTransactionParser {
  private static categoryKeywords: Record<string, string[]> = {
    'Food & Groceries': ['tea', 'chai', 'coffee', 'groceries', 'sabzi', 'dinner', 'lunch', 'breakfast', 'swiggy', 'zomato', 'snack', 'dosa', 'biryani', 'milk', 'bread', 'vegetables'],
    'Travel': ['uber', 'ola', 'auto', 'metro', 'cab', 'petrol', 'fuel', 'diesel', 'flight', 'bus', 'train', 'ticket', 'toll'],
    'Shopping': ['amazon', 'flipkart', 'myntra', 'clothes', 'shoes', 'electronics', 'gift', 'mall'],
    'Bills & Utilities': ['electricity', 'water', 'gas', 'bill', 'wifi', 'broadband', 'cylinder', 'bijli'],
    'Mobile Recharge': ['recharge', 'jio', 'airtel', 'vi', 'vodafone'],
    'Rent': ['rent', 'kiraya', 'room rent', 'flat rent'],
    'Healthcare': ['medicine', 'doctor', 'clinic', 'hospital', 'pharmacy', 'chemist', 'tablet'],
    'Salary': ['salary', 'stipend', 'bonus', 'paycheck'],
    'Freelancing': ['client', 'freelance', 'project', 'upwork', 'fiverr'],
    'Entertainment': ['movie', 'netflix', 'spotify', 'cinema', 'game', 'pvr'],
  };

  public static parse(input: string): ParsedTransactionPreview {
    const raw = input.trim();
    const lower = raw.toLowerCase();

    const amountRegex = /(?:₹|rs\.?|inr)?\s*(\d+(?:,\d+)*(?:\.\d+)?)\s*(?:rs|rupees|bucks)?/i;
    const match = lower.match(amountRegex);

    let amount = 0;
    if (match) {
      const cleanNum = match[1].replace(/,/g, '');
      amount = parseFloat(cleanNum);
    }

    let type: 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'MONEY_LENT' | 'MONEY_BORROWED' = 'EXPENSE';
    let proposedPerson: string | undefined = undefined;

    const lentMatch = lower.match(/(.+?)\s*(?:ko\s+.*diye|ko\s+.*diya|lent to|gave to)/i);
    const borrowMatch = lower.match(/(.+?)\s*(?:se\s+.*liye|se\s+.*liya|borrowed from|got from)/i);

    if (lentMatch) {
      type = 'MONEY_LENT';
      proposedPerson = lentMatch[1].replace(/^(money|cash|i|me)\s+/i, '').trim();
    } else if (borrowMatch) {
      type = 'MONEY_BORROWED';
      proposedPerson = borrowMatch[1].replace(/^(money|cash|i|me)\s+/i, '').trim();
    } else if (lower.includes('salary') || lower.includes('freelance') || lower.includes('received') || lower.includes('income') || lower.includes('earned')) {
      type = 'INCOME';
    } else if (lower.includes('transfer') || lower.includes('sent to bank') || lower.includes('to cash')) {
      type = 'TRANSFER';
    }

    let account = 'Bank Account';
    if (lower.includes('cash') || lower.includes('nakad')) {
      account = 'Cash Wallet';
    } else if (lower.includes('upi') || lower.includes('gpay') || lower.includes('paytm') || lower.includes('phonepe')) {
      account = 'UPI Wallet';
    } else if (lower.includes('hdfc')) {
      account = 'HDFC Bank';
    } else if (lower.includes('sbi')) {
      account = 'State Bank of India';
    } else if (lower.includes('icici')) {
      account = 'ICICI Bank';
    }

    let category = type === 'INCOME' ? 'Salary' : 'Other Expenses';
    for (const [catName, keywords] of Object.entries(this.categoryKeywords)) {
      if (keywords.some(k => lower.includes(k))) {
        category = catName;
        break;
      }
    }

    return {
      success: amount > 0,
      rawInput: raw,
      proposedType: type,
      proposedAmount: amount,
      proposedCategory: category,
      proposedAccountKeyword: account,
      proposedPerson,
      description: raw,
      confidence: amount > 0 ? 0.85 : 0.2,
    };
  }
}
