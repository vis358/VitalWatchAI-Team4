# End-to-end demo script

Synthetic data only. Do not present this as a live clinical system.

1. Start backend and frontend using the README commands.
2. Open http://localhost:5173. Confirm 24 patients and a live connection indicator.
3. Open **Monitoring**. Heart-rate and SpO2 values should change every few seconds.
4. Open patient **P-102** (Rising Heart Rate). Watch the HR tile and chart climb. A red marker appears when `HR_HIGH` or `HR_RISING_TREND` fires.
5. Open **Alerts**. Select the new alert. Confirm the triggering observation, nearby readings, and rule explanation.
6. Acknowledge, then escalate. Confirm the green server confirmation: escalation is internal only.
7. Open **Demo controls**. Select **P-103** and trigger **Falling Oxygen Saturation**. Return to that patient and watch SpO2 drop below 92 with a `SPO2_LOW` alert.
8. Trigger **Stale Monitoring** on a patient. The row should show **Stale** rather than implying the last numbers are current.
9. Trigger **Recovery Trend**. Readings move toward baseline; the existing alert remains until a reviewer resolves it with notes.
10. On an alert page, click **Investigate with VitalWatch AI**. Without Azure credentials you should see a labeled fallback summary built from `get_patient_context`, not a fake model answer.
