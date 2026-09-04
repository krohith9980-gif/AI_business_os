export const formatCurrency = (amount: number | string): string => {
  const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(numericAmount || 0);
};

export const amountInWords = (amount: number): string => {
  const single = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine']
  const double = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
  const tens = ['', 'Ten', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
  
  if (amount === 0) return 'Rupees Zero Only'
  
  const convertNumber = (num: number): string => {
    if (num === 0) return ''
    if (num < 10) return single[num]
    if (num < 20) return double[num - 10]
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 !== 0 ? ' ' + single[num % 10] : '')
    if (num < 1000) return single[Math.floor(num / 100)] + ' Hundred' + (num % 100 !== 0 ? ' ' + convertNumber(num % 100) : '')
    if (num < 100000) return convertNumber(Math.floor(num / 1000)) + ' Thousand' + (num % 1000 !== 0 ? ' ' + convertNumber(num % 1000) : '')
    if (num < 10000000) return convertNumber(Math.floor(num / 100000)) + ' Lakh' + (num % 100000 !== 0 ? ' ' + convertNumber(num % 100000) : '')
    return convertNumber(Math.floor(num / 10000000)) + ' Crore' + (num % 10000000 !== 0 ? ' ' + convertNumber(num % 10000000) : '')
  }

  const integerPart = Math.floor(amount)
  const fractionalPart = Math.round((amount - integerPart) * 100)

  let words = 'Rupees ' + convertNumber(integerPart)
  if (fractionalPart > 0) {
    words += ' and ' + convertNumber(fractionalPart) + ' Paise'
  }
  
  return words + ' Only'
};
