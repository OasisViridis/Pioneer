/** Bound only the close wait. A slow atomic write continues; timeout is not a claim that it failed. */
export async function awaitCloseFlush(save: Promise<void>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      save,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error('尚未确认保存，请重试或选择不再重试并关闭。'));
        }, 8000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
