export async function shareAward(award) {
  const canvas = document.createElement('canvas')
  canvas.width = 960
  canvas.height = 540
  const context = canvas.getContext('2d')
  const dark = !document.documentElement.classList.contains('light')
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent-base').trim() || '#e8a43f'
  context.fillStyle = dark ? '#14171f' : '#f8fafc'
  context.fillRect(0, 0, 960, 540)
  context.strokeStyle = accent
  context.lineWidth = 8
  context.strokeRect(28, 28, 904, 484)
  context.fillStyle = dark ? '#f8fafc' : '#0f172a'
  context.font = 'bold 28px system-ui'
  context.fillText('Habitline', 76, 105)
  context.font = 'bold 52px system-ui'
  context.fillText(award.title, 76, 230, 790)
  context.font = '24px system-ui'
  const words = award.description.split(' ')
  let line = ''
  let y = 295
  for (const word of words) {
    const candidate = line ? line + ' ' + word : word
    if (context.measureText(candidate).width > 790 && line) {
      context.fillText(line, 76, y, 790)
      line = word
      y += 34
    } else line = candidate
  }
  context.fillText(line, 76, y, 790)
  context.fillText(award.earnedOn, 76, 440)
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('Could not create an achievement card.')
  const file = new File([blob], 'habitline-achievement.png', { type: 'image/png' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Habitline achievement' })
      return
    } catch (error) {
      if (error.name === 'AbortError') return
    }
  }
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
