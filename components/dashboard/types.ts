import type { ComponentType } from "react";

/* ---------------- NAVIGATION ---------------- */

export type NavId =
  | "dashboard"
  | "business"
  | "loyalty"
  | "campaigns"
  | "events"        // 🔥 YENİ: EventsTab için
  | "customers"
  | "reports"
  | "settings";

export type NavItem = {
  id: NavId;
  label: string;
  icon: ComponentType<{ className?: string }>;
};


/* ---------------- CAMPAIGNS ---------------- */

export type Campaign = {
  id: string;
  title: string;
  description: string;
  isActive: boolean;
  usageCount: number;
};


/* ---------------- CUSTOMERS ---------------- */

export type Customer = {
  id: string;
  name: string;
  visits: number;
  stamps: number;
  rewards: number;
  lastAction: string;
};


/* ---------------- DASHBOARD ---------------- */

export type DashboardStats = {
  todayStamps: number;
  activeCards: number;
  totalRewards: number;
  activeCampaigns: number;
};


/* ---------------- BUSINESS ---------------- */

export type BusinessForm = {

  // Firestore cafe document id
  cafeId: string;

  // owner uid bazı yerlerde olmayabilir
  ownerUid?: string;

  cafeName: string;
  category: string;

  phone: string;
  address: string;

  location: string;

  openTime: string;
  closeTime: string;

  logoUrl: string;
  description: string;

  isOpen: boolean;
  isVisible: boolean;

  approvalStatus: string;

  createdAt?: any;
  updatedAt?: any;
};


/* ---------------- LOYALTY PROGRAM ---------------- */

export type LoyaltyForm = {
  rewardBuy: number;
  rewardGift: number;
  rewardTitle: string;

  maxDailyStamp: number;

  programActive: boolean;

  expiryDays: number;
};


/* ---------------- EVENTS (YENİ) ---------------- */

export type Event = {
  id: string;
  title: string;
  description: string;
  bannerImage: string;
  eventDate: string;
  eventTime: string;
  isActive: boolean;
  createdAt: any;
};


/* ---------------- CHART ---------------- */

export type ChartDataItem = {
  label: string;
  value: number;
};