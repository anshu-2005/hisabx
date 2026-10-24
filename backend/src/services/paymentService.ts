import crypto from 'crypto';

export interface PlanConfig {
  id: string;
  name: string;
  priceINR: number;
  priceUSD: number;
  interval: 'month' | 'year';
  features: string[];
}

export const SAAS_PLANS: Record<string, PlanConfig> = {
  FREE: {
    id: 'plan_free',
    name: 'Starter Plan',
    priceINR: 0,
    priceUSD: 0,
    interval: 'month',
    features: ['3 Accounts', 'Monthly Ledger', 'Basic Calendar', 'Standard CSV Export']
  },
  PRO_MONTHLY: {
    id: 'plan_pro_monthly',
    name: 'Pro Financial OS (Monthly)',
    priceINR: 199,
    priceUSD: 2.99,
    interval: 'month',
    features: ['Unlimited Accounts', 'Bank Statement AI Parser', 'UPI Webhook Bridge', 'Splitwise Group Split', 'Realtime Sync']
  },
  PRO_YEARLY: {
    id: 'plan_pro_yearly',
    name: 'Pro Financial OS (Yearly)',
    priceINR: 1499,
    priceUSD: 19.99,
    interval: 'year',
    features: ['Everything in Pro', '2 Months Free', 'Priority 24/7 Cloud Backup', 'GST Invoicing']
  },
  ENTERPRISE: {
    id: 'plan_enterprise',
    name: 'Accounting & Freelance Suite',
    priceINR: 4999,
    priceUSD: 69.99,
    interval: 'year',
    features: ['Everything in Pro Yearly', 'Multi-user Workspace', 'Client Audit Logs', 'Custom Webhooks']
  }
};

export class PaymentService {
  private static razorpayKey = process.env.RAZORPAY_KEY_ID || 'rzp_test_mock_key';
  private static razorpaySecret = process.env.RAZORPAY_KEY_SECRET || 'rzp_test_mock_secret';

  static createPaymentOrder(userId: string, planKey: string) {
    const plan = SAAS_PLANS[planKey.toUpperCase()] || SAAS_PLANS.PRO_YEARLY;
    const orderId = `order_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    return {
      success: true,
      orderId,
      amount: plan.priceINR * 100, // paise
      currency: 'INR',
      planName: plan.name,
      razorpayKey: this.razorpayKey,
      notes: {
        userId,
        planId: plan.id
      }
    };
  }

  static verifySignature(orderId: string, paymentId: string, signature: string): boolean {
    if (!this.razorpaySecret || this.razorpaySecret.startsWith('rzp_test')) {
      // Mock validation in test/dev
      return true;
    }
    const expected = crypto
      .createHmac('sha256', this.razorpaySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    return expected === signature;
  }

  static generateInvoice(userId: string, paymentId: string, amount: number, planName: string) {
    const invoiceNumber = `INV-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
    const gstRate = 0.18; // 18% GST in India
    const baseAmount = amount / (1 + gstRate);
    const gstAmount = amount - baseAmount;

    return {
      invoiceNumber,
      date: new Date().toISOString(),
      userId,
      paymentId,
      planName,
      currency: 'INR',
      baseAmount: Math.round(baseAmount * 100) / 100,
      gstAmount: Math.round(gstAmount * 100) / 100,
      totalAmount: amount,
      status: 'PAID',
      company: {
        name: 'HisabX Fintech OS Pvt Ltd',
        gstin: '27AADCH1234F1Z5',
        address: 'Hiranandani Business Park, Powai, Mumbai, Maharashtra 400076'
      }
    };
  }
}
