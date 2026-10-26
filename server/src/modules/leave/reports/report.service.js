import * as reportRepo from "./report.repository.js";

export async function getLeaveSummaries() {
  return reportRepo.getEmployeeLeaveSummaries();
}

export async function getMonthlyRegister(year, month) {
  const y = Number(year) || new Date().getFullYear();
  const m = Number(month) || new Date().getMonth() + 1;
  return reportRepo.getMonthlyLeaveRegister(y, m);
}

export async function getPendingSummary() {
  return reportRepo.getPendingApprovalsSummary();
}
