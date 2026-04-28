import frappe


class CMPriceCalculator(frappe.model.document.Document):
    def validate(self):
        # Uppercase the code
        if self.calculator_code:
            self.calculator_code = self.calculator_code.upper()
        # Re-sequence idx on child rows
        for i, step in enumerate(self.steps or [], start=1):
            step.idx = i
