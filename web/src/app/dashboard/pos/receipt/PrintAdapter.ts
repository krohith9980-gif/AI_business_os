/**
 * PrintAdapter handles the browser print workflow cleanly.
 */

export const PrintAdapter = {
  /**
   * Invokes the browser print dialog.
   * Returns a promise that resolves when the print dialog is closed.
   * Note: Browsers do not reliably report if the user actually clicked "Print" or "Cancel",
   * so this resolves upon the dialog closing in either case.
   */
  printReceipt: (): Promise<void> => {
    return new Promise((resolve) => {
      // Some browsers fire afterprint, some don't reliably. 
      // We set a small timeout fallback just in case.
      let resolved = false
      
      const handleAfterPrint = () => {
        if (resolved) return
        resolved = true
        window.removeEventListener('afterprint', handleAfterPrint)
        resolve()
      }

      window.addEventListener('afterprint', handleAfterPrint)
      
      // Invoke print
      try {
        window.print()
      } catch (e) {
        console.error('Print failed:', e)
        if (!resolved) {
          resolved = true
          window.removeEventListener('afterprint', handleAfterPrint)
          resolve()
        }
      }

      // Fallback if afterprint doesn't fire immediately (e.g., iOS Safari sometimes)
      // Actually, window.print() is blocking in most desktop browsers. 
      // Once it unblocks, we resolve.
      setTimeout(() => {
        if (!resolved) {
          resolved = true
          window.removeEventListener('afterprint', handleAfterPrint)
          resolve()
        }
      }, 500)
    })
  }
}
