import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EligibilityDialog } from './EligibilityDialog';

describe('EligibilityDialog', () => {
  it('keeps answers while navigating and approves three no answers', async () => {
    const user = userEvent.setup();
    const approved = vi.fn();
    render(<EligibilityDialog onClose={vi.fn()} onApproved={approved} />);

    await user.click(screen.getByText('以上情况都没有'));
    await user.click(screen.getByRole('button', { name: '下一步' }));
    await user.click(screen.getByText('以上情况都没有'));
    await user.click(screen.getByRole('button', { name: '下一步' }));
    await user.click(screen.getByText('以上情况都没有'));
    await user.click(screen.getByRole('button', { name: '确认并开始' }));

    expect(approved).toHaveBeenCalledOnce();
  });

  it('shows professional confirmation guidance for an unsure answer', async () => {
    const user = userEvent.setup();
    render(<EligibilityDialog onClose={vi.fn()} onApproved={vi.fn()} />);

    await user.click(screen.getByText('目前还拿不准'));
    await user.click(screen.getByRole('button', { name: '下一步' }));
    await user.click(screen.getByText('以上情况都没有'));
    await user.click(screen.getByRole('button', { name: '下一步' }));
    await user.click(screen.getByText('以上情况都没有'));
    await user.click(screen.getByRole('button', { name: '确认并开始' }));

    expect(screen.getByRole('heading', { name: '请先向专业人员确认适用情况' })).toBeInTheDocument();
  });
});
