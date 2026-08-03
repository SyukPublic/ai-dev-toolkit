import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, within } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import axios from 'axios';
import CommentForm from './CommentForm';

vi.mock('axios');

describe('CommentForm', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the heading', () => {
    const { container } = render(<CommentForm postId="1" />);
    expect(container.querySelector('h2').textContent).toBe('Leave a comment');
  });

  it('renders the body field', () => {
    const { getByTestId } = render(<CommentForm postId="1" />);
    expect(getByTestId('comment-body')).toBeInTheDocument();
  });

  it('renders the submit button', () => {
    const { getByTestId } = render(<CommentForm postId="1" />);
    expect(getByTestId('comment-submit')).toBeInTheDocument();
  });

  it('starts with an empty body', () => {
    render(<CommentForm postId="1" />);
    expect(screen.getByTestId('comment-body').value).toBe('');
  });

  it('matches the snapshot', () => {
    const { container } = render(<CommentForm postId="1" />);
    expect(container).toMatchSnapshot();
  });

  it('updates state when typing', () => {
    const { getByTestId } = render(<CommentForm postId="1" />);
    fireEvent.change(getByTestId('comment-body'), { target: { value: 'Nice post' } });
    expect(getByTestId('comment-body').value).toBe('Nice post');
  });

  it('submits the comment', async () => {
    axios.post.mockResolvedValue({ data: { success: true } });
    const { getByTestId } = render(<CommentForm postId="1" />);

    fireEvent.change(getByTestId('comment-body'), { target: { value: 'Nice post' } });
    act(() => {
      fireEvent.click(getByTestId('comment-submit'));
    });

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(screen.getByText('Thanks for your comment!')).toBeInTheDocument();
  });

  it('does not show the success message before submitting', () => {
    render(<CommentForm postId="1" />);
    // Correct as written: queryBy returns null, so .not works safely.
    expect(screen.queryByText('Thanks for your comment!')).not.toBeInTheDocument();
  });

  it('shows the author name inside the preview card', () => {
    render(<CommentForm postId="1" authorName="Ada" />);
    // Correct as written: scope the query to the card before asserting.
    const card = screen.getByRole('article');
    expect(within(card).getByText('Ada')).toBeInTheDocument();
  });
});
