export interface StringToIncludeExcludeInterface {
  include: string;
  exclude: string;
}

/**
 * str is either
 *  'browserId_dd596c87_tabId_1628889998'
 *      or
 *  '!browserId_dd596c87_tabId_1628889998'
 */
export type StringToIncludeExcludeFn = (str: string) => StringToIncludeExcludeInterface;
