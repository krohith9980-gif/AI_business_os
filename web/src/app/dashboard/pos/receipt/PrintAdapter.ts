/**
 * PrintAdapter handles the browser print workflow cleanly.
 */

const injectPageStyle = (cssText: string) => {
  const style = document.createElement('style')
  style.id = 'print-page-style'
  style.textContent = cssText
  document.head.appendChild(style)
  return style
}

const removePageStyle = (style: HTMLStyleElement) => {
  if (style && style.parentNode) {
    style.parentNode.removeChild(style)
  }
}

export const PrintAdapter = {
  /**
   * Invokes the browser print dialog for thermal receipt.
   */
  printThermal: (): Promise<void> => {
    return new Promise((resolve) => {
      const style = injectPageStyle('@page { size: 80mm auto; margin: 0; }')
      document.body.classList.add('print-thermal')
      
      let resolved = false
      const handleAfterPrint = () => {
        if (resolved) return
        resolved = true
        document.body.classList.remove('print-thermal')
        removePageStyle(style)
        window.removeEventListener('afterprint', handleAfterPrint)
        resolve()
      }

      window.addEventListener('afterprint', handleAfterPrint)
      
      try {
        window.print()
      } catch (e) {
        console.error('Print failed:', e)
        if (!resolved) {
          resolved = true
          document.body.classList.remove('print-thermal')
          removePageStyle(style)
          window.removeEventListener('afterprint', handleAfterPrint)
          resolve()
        }
      }

      setTimeout(() => {
        if (!resolved) {
          resolved = true
          document.body.classList.remove('print-thermal')
          removePageStyle(style)
          window.removeEventListener('afterprint', handleAfterPrint)
          resolve()
        }
      }, 500)
    })
  },

  /**
   * Invokes the browser print dialog for A4 receipt.
   */
  printA4: (): Promise<void> => {
    return new Promise((resolve) => {
      const style = injectPageStyle('@page { size: A4; margin: 10mm; }')
      document.body.classList.add('print-a4')
      
      let resolved = false
      const handleAfterPrint = () => {
        if (resolved) return
        resolved = true
        document.body.classList.remove('print-a4')
        removePageStyle(style)
        window.removeEventListener('afterprint', handleAfterPrint)
        resolve()
      }

      window.addEventListener('afterprint', handleAfterPrint)
      
      try {
        window.print()
      } catch (e) {
        console.error('Print failed:', e)
        if (!resolved) {
          resolved = true
          document.body.classList.remove('print-a4')
          removePageStyle(style)
          window.removeEventListener('afterprint', handleAfterPrint)
          resolve()
        }
      }

      setTimeout(() => {
        if (!resolved) {
          resolved = true
          document.body.classList.remove('print-a4')
          removePageStyle(style)
          window.removeEventListener('afterprint', handleAfterPrint)
          resolve()
        }
      }, 500)
    })
  },

  /**
   * Legacy method for backward compatibility.
   */
  printReceipt: (): Promise<void> => {
    return PrintAdapter.printThermal()
  }
}
