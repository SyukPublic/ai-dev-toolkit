/** The outbound mail adapter. Constructed at the composition root; imported by senders. */
export interface Mail {
  to: string;
  subject: string;
  body: string;
}

export const transport = {
  async send(mail: Mail): Promise<void> {
    void mail;
  },
};
