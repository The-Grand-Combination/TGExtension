import * as vscode from 'vscode';
import { LocalizationManager } from './localizationManager';

export interface HoverProvider {
  regex: RegExp;
  handler: (text: string, document: vscode.TextDocument) => Promise<vscode.Hover | undefined>;
}

export const hoverProviders: HoverProvider[] = [
  {
      regex: /\b(?:has_country_flag|clr_country_flag|add_country_flag|remove_country_modifier|add_country_modifier|title|desc|name|news_desc_short|news_desc_medium|news_desc_long)\s*=\s*["']?([\w-]+)["']?/,
      handler: async (text: string, document: vscode.TextDocument) => {
          const value = await LocalizationManager.searchLocalization(text, document);
          return new vscode.Hover(new vscode.MarkdownString(value || 'No Source Found.'));
      }
  },
  {
      regex: /\b(?!AND\b|NOT\b)[A-Z0-9]{3}\b/,
      handler: async (text: string, document: vscode.TextDocument) => {
          const value = await LocalizationManager.searchLocalization(text, document);
          return new vscode.Hover(new vscode.MarkdownString(value || 'No Source Found.'));
      }
  }
];