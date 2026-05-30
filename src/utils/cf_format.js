// src/utils/format.js
import { Timestamp } from 'firebase/firestore';

export function formatCurrency(amount) {
  if (amount === null || amount === undefined || isNaN(amount)) return '₹0';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(dateInput) {
  if (!dateInput) return '—';
  let date;
  if (dateInput instanceof Timestamp) {
    date = dateInput.toDate();
  } else if (dateInput instanceof Date) {
    date = dateInput;
  } else if (typeof dateInput === 'string') {
    date = new Date(dateInput);
  } else if (dateInput?.seconds) {
    date = new Date(dateInput.seconds * 1000);
  } else {
    return '—';
  }
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateInput(dateInput) {
  if (!dateInput) return '';
  let date;
  if (dateInput instanceof Timestamp) date = dateInput.toDate();
  else if (dateInput?.seconds) date = new Date(dateInput.seconds * 1000);
  else date = new Date(dateInput);
  return date.toISOString().split('T')[0];
}

export function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

export function formatMonthYear(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

export function parseAmount(str) {
  return parseFloat(str.toString().replace(/[^0-9.]/g, '')) || 0;
}

export function roundTo(num, decimals = 2) {
  return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
}
