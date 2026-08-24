import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from './App'

afterEach(cleanup)

const openPulse = (): void => {
  render(<App />)
  fireEvent.click(screen.getByText('Confirm Pulse scope with Rahul'))
}

describe('Posita vertical slice', () => {
  it('moves from the Daily Brief into grounded Pulse context', () => {
    openPulse()

    expect(screen.getByRole('heading', { name: 'Pulse' })).toBeInTheDocument()
    expect(screen.getByText('Current status')).toBeInTheDocument()
    expect(screen.getByText('Each update is linked to its source.')).toBeInTheDocument()
  })

  it('opens the source email behind a timeline claim', () => {
    openPulse()
    fireEvent.click(screen.getByText('Rahul asked for final confirmation before tomorrow morning.'))

    expect(screen.getByText('Source email')).toBeInTheDocument()
    expect(screen.getByText(/Engineering needs the final call before tomorrow morning/)).toBeInTheDocument()
    expect(screen.getByText('shafi@studio.co')).toBeInTheDocument()
  })

  it('opens an editable draft while keeping send disabled', () => {
    openPulse()
    fireEvent.click(screen.getByRole('button', { name: /Draft reply/i }))

    const editor = screen.getByRole('textbox', { name: 'Draft reply text' })
    expect((editor as HTMLTextAreaElement).value).toContain('new dashboard')
    expect(screen.getByRole('button', { name: /Review & send/i })).toBeDisabled()
    expect(screen.getByText('Sending is disabled in prototype mode')).toBeInTheDocument()
  })
})
