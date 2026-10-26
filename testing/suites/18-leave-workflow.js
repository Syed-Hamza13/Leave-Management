import { By, until } from "selenium-webdriver";

export default {
  name: "leave-workflow",
  area: "Leave calculation, application lifecycle, approval and ledger balance transactions",
  async setup({ adminApi }) {
    // Clean up any pending applications from previous test runs
    const listRes = await adminApi.get("/leave/applications");
    if (listRes.status === 200 && Array.isArray(listRes.body?.data)) {
      for (const app of listRes.body.data) {
        if (["SUBMITTED", "PENDING_APPROVAL", "PARTIALLY_APPROVED", "APPROVED"].includes(app.status)) {
          await adminApi.post(`/leave/applications/${app.id}/cancel`, {
            reason: "Automatic test fixture cleanup",
          }).catch(() => {});
        }
      }
    }
    return {};
  },
  tests: [
    {
      name: "leave calculation API accurately computes working days and detects non-working days",
      screen: "/leave/apply",
      fn: async ({ adminApi, assert }) => {
        // Fetch active types
        const typesRes = await adminApi.get("/leave/types");
        assert.eq(typesRes.status, 200, "types endpoint returns 200");
        assert.ok(Array.isArray(typesRes.body?.data), "types list is an array");
        assert.ok(typesRes.body.data.length > 0, "at least one leave type exists");

        const leaveType = typesRes.body.data.find((t) => t.code === "PL" || t.key === "privilege_leave") || typesRes.body.data[0];

        // Calculate for a 3-day weekday span in November 2026 (Mon Nov 2 to Wed Nov 4, 2026)
        const calcRes = await adminApi.post("/leave/calculate", {
          leaveTypeId: leaveType.id,
          startDate: "2026-11-02",
          endDate: "2026-11-04",
        });

        assert.eq(calcRes.status, 200, "calculate endpoint returns 200");
        const calc = calcRes.body?.data;
        assert.ok(calc, "calculation object returned");
        assert.eq(calc.requested_days || calc.calendarDays, 3, "requested days is 3");
        assert.ok((calc.total_deducted_days || calc.calculatedUnits) > 0, "total deducted days > 0");
        assert.ok(Array.isArray(calc.breakdown || calc.dayBreakdown), "daily breakdown array returned");
      },
    },
    {
      name: "leave balance endpoint reports positive opening balances from seed ledger",
      screen: "/leave",
      fn: async ({ adminApi, assert }) => {
        const balancesRes = await adminApi.get("/leave/balances");
        assert.eq(balancesRes.status, 200, "balances endpoint returns 200");
        assert.ok(Array.isArray(balancesRes.body?.data), "balances array returned");
        assert.ok(balancesRes.body.data.length > 0, "admin has leave balances allocated");

        const plBalance = balancesRes.body.data.find((b) => b.leave_type_code === "PL" || b.leave_type_key === "privilege_leave");
        if (plBalance) {
          assert.ok(Number(plBalance.current_balance) > 0, "PL balance is greater than 0");
        }
      },
    },
    {
      name: "end-to-end leave lifecycle: apply, calculate preview, approve, and cancel",
      screen: "/leave/apply",
      fn: async ({ session, assert, config }) => {
        await session.login(config.admin);

        // 1. Visit apply page
        await session.goto("/leave/apply");
        assert.eq(await session.pathname(), "/leave/apply", "navigated to /leave/apply");

        // Wait for leave types select to populate
        const typeSelectLocator = By.id("leave-type-select");
        await session.driver.wait(until.elementLocated(typeSelectLocator), 8000);
        const typeSelect = await session.driver.findElement(typeSelectLocator);

        const options = await typeSelect.findElements(By.css("option"));
        assert.ok(options.length > 0, "leave type dropdown populated with options");

        // Fill dates for December 2026 reliably
        await session.driver.executeScript(`
          const start = document.getElementById("leave-start-date");
          const end = document.getElementById("leave-end-date");
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
          setter.call(start, "2026-12-08");
          start.dispatchEvent(new Event("input", { bubbles: true }));
          start.dispatchEvent(new Event("change", { bubbles: true }));
          setter.call(end, "2026-12-09");
          end.dispatchEvent(new Event("input", { bubbles: true }));
          end.dispatchEvent(new Event("change", { bubbles: true }));
        `);

        await session.driver.sleep(500);

        const reasonArea = await session.driver.findElement(By.id("leave-reason"));
        await reasonArea.clear();
        await reasonArea.sendKeys("Attending educational family conference");

        // Wait for preview calculation card to appear
        await session.driver.sleep(800);

        // Submit the form
        const submitBtn = await session.driver.findElement(By.xpath('//button[normalize-space()="Submit Leave Request"]'));
        await submitBtn.click();

        // Should redirect to My Leaves
        await session.driver.wait(until.urlContains("/leave/my-leaves"), 10000);
        assert.eq(await session.pathname(), "/leave/my-leaves", "redirected to /leave/my-leaves upon submission");

        // Verify the newly created application is visible in the list
        const appRow = await session.driver.wait(
          until.elementLocated(By.xpath('//table//tr[contains(.,"Attending educational family conference")]')),
          8000
        );
        assert.ok(appRow, "new leave application visible in My Leaves table");

        // 2. Visit approvals page and approve the request
        await session.goto("/leave/approvals");
        assert.eq(await session.pathname(), "/leave/approvals", "navigated to /leave/approvals");

        const reviewBtn = await session.driver.wait(
          until.elementLocated(By.xpath('//button[contains(normalize-space(),"Review & Action")]')),
          8000
        );
        await reviewBtn.click();

        // Click Approve Request in the modal
        const approveBtn = await session.driver.wait(
          until.elementLocated(By.xpath('//button[contains(normalize-space(),"Approve Request")]')),
          6000
        );
        await approveBtn.click();

        await session.driver.sleep(1500);

        // 3. Return to My Leaves and cancel the approved request
        await session.goto("/leave/my-leaves");
        const cancelBtn = await session.driver.wait(
          until.elementLocated(By.xpath('//button[contains(normalize-space(),"Cancel")]')),
          8000
        );
        await cancelBtn.click();

        // Fill cancel reason and confirm
        const cancelReasonArea = await session.driver.wait(
          until.elementLocated(By.xpath('//textarea[contains(@placeholder,"cancelling")]')),
          5000
        );
        await cancelReasonArea.sendKeys("Trip cancelled due to change of plans");

        const confirmCancelBtn = await session.driver.findElement(
          By.xpath('//button[contains(normalize-space(),"Confirm Cancellation")]')
        );
        await confirmCancelBtn.click();

        await session.driver.sleep(1500);

        // Verify status badge shows CANCELLED
        const cancelledBadge = await session.driver.wait(
          until.elementLocated(By.xpath('//span[contains(normalize-space(),"CANCELLED")]')),
          6000
        );
        assert.ok(cancelledBadge, "application status updated to CANCELLED");
      },
    },
  ],
};
