import { render, screen } from '@testing-library/react';
import App from './App';

test("renders the retro todo title and add button", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: /retro to-do list/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /add/i })).toBeInTheDocument();
});
