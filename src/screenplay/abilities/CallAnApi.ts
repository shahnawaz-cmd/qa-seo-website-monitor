import axios, { AxiosInstance } from 'axios';
import { Ability } from '../Ability';

export class CallAnApi extends Ability {
  public readonly client: AxiosInstance;

  constructor(baseURL?: string) {
    super();
    this.client = axios.create({
      baseURL,
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      validateStatus: () => true // Allow handling all status codes manually
    });
  }

  static at(baseURL: string): CallAnApi {
    return new CallAnApi(baseURL);
  }
}
